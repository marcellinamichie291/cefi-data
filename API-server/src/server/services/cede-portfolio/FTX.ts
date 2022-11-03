import {BorrowEvent, DepositWithdrawEvent, FundingEvent, TradeEvent} from "./types";

const BASE_URL = "https://ftx.com";
import {RestClient} from "ftx-api";
import {createHmac, sign} from "crypto";
import fetch from "node-fetch-commonjs";
import * as CryptoJS from "crypto-js";

/**
 *
 * Technically speaking, this file shouldn't be here.
 * It's only there for practical testing purposes
 *
 * @param strDate
 */
export function deserializeTsFromDate(strDate: string) {
  return Math.floor((new Date(strDate)).getTime() / 1000);
}

/**
 * Formats an FTX trade into our own format
 */

function formatFtxTrade(rawTrade: any): TradeEvent | null {
  //TODO perps and futures can have base||quote set to null;

  let timestamp = deserializeTsFromDate(rawTrade.time);
  let base = rawTrade.baseCurrency;
  let quote = rawTrade.quoteCurrency;
  let amount = rawTrade.size;
  let price = rawTrade.price;
  let side = rawTrade.side;
  let fee = rawTrade.fee;
  let feeCurrency = rawTrade.feeCurrency;
  let id = rawTrade.id;
  let source = "FTX";
  let type = "trade"

  if (rawTrade.baseCurrency === null || rawTrade.quoteCurrency === null) {
    if (rawTrade.future) {
      type = "futures";
      base = rawTrade.market;
      quote = "USD";
    } else {
      return null;
    }

  }
  return {
    timestamp: timestamp,
    type: type,
    asset: base,
    quote: quote,
    amount: amount,
    price: price,
    fee: fee,
    side: side,
    feeCurrency: feeCurrency,
    id: id,
    source: source,
  }
}

function formatFtxPnl(pnl: any) {
  if (!pnl.closed) return null;
  let timestamp = deserializeTsFromDate(pnl.endingAt);

  return {
    timestamp: timestamp,
    asset: "USD",
    pnl: pnl.pnlMarkedToEnd,
    type: "pnl",
  }
}

function formatFtxBorrow(rawBorrow: any): BorrowEvent {
  let timestamp = deserializeTsFromDate(rawBorrow.time);
  return {
    timestamp: timestamp,
    asset: rawBorrow.coin,
    amount: rawBorrow.size,
    fee: rawBorrow.rate,
    type: "borrow"
  }
}

function formatFtxFunding(rawFunding: any): FundingEvent {
  let timestamp = deserializeTsFromDate(rawFunding.time);
  return {
    timestamp: timestamp,
    asset: "USD",
    fee: rawFunding.payment, //positive fee = you pay, negative fee = you get paid
    type: "funding"
  }
}

function formatFtxWithdrawal(rawWithdrawal: any, usdBasket: Array<string>): DepositWithdrawEvent | [] {
  let timestamp = deserializeTsFromDate(rawWithdrawal.time);
  let asset = rawWithdrawal.coin;
  if (usdBasket.includes(rawWithdrawal.coin)) asset = "USD";
  if (rawWithdrawal.status === "cancelled") return [];
  return {
    timestamp: timestamp,
    asset: asset,
    amount: rawWithdrawal.size,
    fee: rawWithdrawal.fee,
    type: "withdrawal",
  }
}

class FTX {
  client;
  apiKey;
  apiSecret;

  constructor(name: string, apiKey: string, apiSecret: string) {
    this.apiKey=apiKey;
    this.apiSecret=apiSecret
    this.client = new RestClient(this.apiKey, this.apiSecret);
  }

  async queryBalances(): Promise<any> {
    const rawBalances = await this.client.getBalances();

    let currentBalances: any = {timestamp: new Date().getTime() / 1000};
    rawBalances.result.forEach((rawBalance) => {
      currentBalances[rawBalance.coin] = rawBalance.total
    })
    // For futures, there's technically no 'base asset'. So it doesn't appear in balances. So actually when querying balances
    // we also need to query open positions.
    const rawPositions = await this.client.getPositions();
    rawPositions.result.forEach((position) => {
      // Use this if we do solution n.1 i.e futures positions are like trades
      currentBalances[position.future] = position.size;
      currentBalances["USD"] -= position.cost;
      //otherwise sol.2 with this :
      // currentBalances["USD"] -= (position.realizedPnl + position.unrealizedPnl);
    });

    return currentBalances;
  }

  async queryUsdValue(): Promise<any> {
    try {
      const endpoint = "/api/wallet/usd_value_snapshots?limit=10000"
      const url = BASE_URL+endpoint
      let ts = new Date().getTime();
      let method = "GET"
      let signature_payload = `${ts}${method}${endpoint}`;
      let signature = CryptoJS.HmacSHA256(signature_payload, this.apiSecret).toString(CryptoJS.enc.Hex);
      const res = await fetch(url, {
        method: "GET",
        headers: {
          'FTX-KEY': this.apiKey,
          'FTX-SIGN': signature.toString(),
          'FTX-TS': ts.toString(),
        }
      })
      const usdValues: any = await res.json();
      return usdValues;

    }catch(e){
      console.log(e)
    }
  }

  async queryBorrows() {
    const rawData = await this.fullHistoryFetch(this.client.getBorrowHistory.bind(this.client));
    let borrows = rawData.flatMap((rawBorrow: any) => {
      return formatFtxBorrow(rawBorrow);
    })
    return borrows;
  }

  async queryFundings() {

    const rawData = await this.fullHistoryFetch(this.client.getFundingPayments.bind(this.client));
    let fundings = rawData.flatMap((rawFunding: any) => {
      return formatFtxFunding(rawFunding);
    })
    return fundings;

  }

  async queryWithdrawals() {
    try {

      const rawData = await this.fullHistoryFetch(this.client.getWithdrawalHistory.bind(this.client));
//FTX considers USD to be equal to USDC
//So when withdrawing USD, if you withdraw USDC you'll have negative balance
//Same when depositing USDC
// -> For all pairs in FTX's USD basket we need to convert them to USD
      let usdBasket = ["USD", "USDC", "TUSD", "USDP", "BUSD", "HUSD"];
      let withdrawals = rawData.flatMap((rawWithdrawal: any) => {
        return formatFtxWithdrawal(rawWithdrawal, usdBasket)
      })
      return withdrawals;
    } catch (err) {
      console.log(err);
    }
  }



  async queryPnlReport() {
    let endpoint = "/api/pnl_reports/candidates";
    const url = BASE_URL+endpoint
    let ts = new Date().getTime();
    let method = "GET"
    let signature_payload = `${ts}${method}${endpoint}`;
    let signature = CryptoJS.HmacSHA256(signature_payload, this.apiSecret).toString(CryptoJS.enc.Hex);;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        'FTX-KEY': this.apiKey,
        'FTX-SIGN': signature,
        'FTX-TS': ts.toString(),
      }
    })
    const rawReport: any = await res.json();

    let pnlReport = rawReport.result.flatMap((rawPnl: any) => {
      let fmtPnl = formatFtxPnl(rawPnl);
      if (fmtPnl === null) return [];
      return fmtPnl;
    })

    return pnlReport;

  }

  async queryDeposits() {
    try {

      const rawData = await this.fullHistoryFetch(this.client.getDepositHistory.bind(this.client));
      let usdBasket = ["USD", "USDC", "TUSD", "USDP", "BUSD", "HUSD"];
      let deposits = rawData.flatMap((deposit: any) => {
        let timestamp = deserializeTsFromDate(deposit.time);
        let asset = deposit.coin;
        if (usdBasket.includes(deposit.coin)) asset = "USD";

        return {
          timestamp: timestamp,
          asset: asset,
          amount: deposit.size,
          fee: deposit.fee,
          type: "deposit"
        }
      })

      let sortedDeposits = deposits.sort((a: any, b: any) => {
        return (b.timestamp - a.timestamp);
      })
      return sortedDeposits;

    } catch (err) {
      console.log(err);
    }
  }

  async fullHistoryFetch(endpoint: any) {
    let rawData: any = []
    //endTime is the current time
    //TODO test with start time at 0...
    let endTime = Math.floor(Date.now() / 1000)
    //We'll fetch orders month by month, so startTime = endTime - 1mo
    let d = new Date();
    let startTime = Math.floor((d.setMonth(d.getMonth() - 2)) / 1000)
    let res;
    let idMap = new Map();
    //Supports pagination with start_time and end_time as params.
    //We'll query as long as there is a result. (could take quite some time).
    //Problem is, sometimes we'll miss orders if we use the last end_time as our next pagination
    //To fix it, we add +1
    //And to avoid duplication of orders, we won't add orders if the id already is added.
    do {
      let partialData;
      partialData = await endpoint({start_time: 1608498994, end_time: 1646082994});
      res = partialData.result;
      if (res.length === 0) break;
      //depends if it's an order or a fill
      //TODO if we don't support orders remove 2nd condition
      //TODO only borrow has no id... so if its a borrow we can't have duplicates, so not necessary to check
      let rawEndTime = res[res.length - 1].time
      endTime = deserializeTsFromDate(rawEndTime) + 1;
      let endDate = new Date(endTime);
      startTime = endDate.setMonth(endDate.getMonth() - 2) / 1000;
      let count = 0;
      res.forEach((event: any) => {
        //FOR BORROWS
        let id = event.id
        if (!id) id = deserializeTsFromDate(event.time);
        if (!idMap.get(id)) {
          rawData.push(event);
        } else {
          count++;
        }
        idMap.set(id, true);
      })
      if (count === res.length) break;
    } while (res.length > 0);
    return rawData;
  }

  async queryTrades(): Promise<any> {
    try {
      const rawData = await this.fullHistoryFetch(this.client.getFills.bind(this.client));
      let trades = rawData.flatMap((rawTrade: any) => {
        let fmtTrade = formatFtxTrade(rawTrade);
        if (fmtTrade === null) return [];
        return fmtTrade;
      });

      let sortedTrades = trades.sort((a: any, b: any) => {
        return (b.timestamp - a.timestamp);
      })
      let buyAmount = 0;
      let sellAmount = 0;
      sortedTrades.forEach((trade: any) => {
        if (trade.type === "futures") {
          if (trade.side === "buy") {
            buyAmount += trade.amount;
          } else {
            sellAmount += trade.amount;
          }
        }
      });
      return sortedTrades;

    } catch (err) {
      console.log(err);
    }
  }

  async queryEvents() {
    const trades = await this.queryTrades();
    const deposits = await this.queryDeposits();
    const withdrawals = await this.queryWithdrawals();
    const pnlReport = await this.queryPnlReport();
    const borrows = await this.queryBorrows();
    const fundings = await this.queryFundings();


    let events: any = [];
    events = events.concat(trades, deposits, withdrawals, pnlReport, borrows, fundings);
    let sortedEvents = events.sort((a: any, b: any) => {
      return (b.timestamp - a.timestamp);
    })
    return sortedEvents;

  }

}

export default FTX;

