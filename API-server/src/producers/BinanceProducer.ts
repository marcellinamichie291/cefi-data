import kafka from 'kafka-node';
import {TickerData, Ticker} from "./interfaces";
import fetch from "node-fetch-commonjs";
import 'dotenv/config';

interface BinanceRestTickerData {
  symbol: string,
  priceChange: string,
  priceChangePercent: string,
  weightedAvgPrice: string,
  prevClosePrice: string,
  lastPrice: string,
  lastQty: string,
  bidPrice: string,
  bidQty: string,
  askPrice: string,
  askQty: string,
  openPrice: string,
  highPrice: string,
  lowPrice: string,
  volume: string,
  quoteVolume: string
  openTime: number,
  closeTime: number,
  firstId: number,
  lastId: number,
  count: number,
}

interface BinanceWsTickerData {
  e: string,
  E: number,
  s: string,
  c: string,
  o: string,
  h: string,
  l: string,
  v: string,
  q: string,
}


class BinanceProducer {
  webSocketURL: string;
  endpoint: string;
  restURL: string;
  binanceTickers: Array<Ticker>

  constructor() {
    this.webSocketURL = "wss://stream.binance.com:9443/ws/"
    this.endpoint = "!miniTicker@arr"
    this.restURL = "https://api.binance.com/api/v3"
    this.binanceTickers = []
  }

  /**
   * Fetches information about all the market symbols from binance.
   * We're only interested in {ticker,baseAsset,quoteAsset}
   */
  fetchAllSymbols = async (): Promise<void> => {
    try {
      const response = await fetch(this.restURL + "/exchangeInfo");
      const {symbols}: any = await response.json() as Array<any>;
      let binanceTickers: Array<Ticker> = symbols.map((symbol: any) => {
        return {
          ticker: symbol.symbol,
          baseAsset: symbol.baseAsset,
          quoteAsset: symbol.quoteAsset,
        }
      });
      this.binanceTickers=binanceTickers;
    } catch (err) {
      console.log(err)
    }
  }

  /**
   * Fetches market data for all of binance's tickers.
   */
  fetchAllTickers = async (): Promise<Array<BinanceRestTickerData>> => {
    try {
      const response = await fetch(this.restURL + "/ticker/24hr");
      const markets = await response.json() as Array<BinanceRestTickerData>;
      return markets;
    } catch (err) {
      console.log(err)
      return [];
    }
  }

  /**
   * Formats our data to a common format shared between exchanges
   * Removes non-USD quotes from our data
   * @param tickers result of the fetchAllTickers function
   */
  formatTicker = (tickers: Array<BinanceRestTickerData>): Array<TickerData> => {
    let curTime = new Date().getTime();
    const usdPairs = ["TUSD", "USDT", "USDC", "USD", "DAI", "UST"];
    //We want to skip elements that have a/ price=0 b/quote not a usd pair
    //Instead of using a map we can use flatMap w/ a callback function
    const fmtTickers = tickers.flatMap((ticker) => {
      const tickerInfo = this.binanceTickers.find((info) => ticker.symbol.includes((info.ticker)))!;
      const base = tickerInfo.baseAsset;
      const quote = tickerInfo.quoteAsset;
      const price = parseFloat(ticker.lastPrice);
      const isUsdQuote = usdPairs.includes(quote);
      if(price===0||!isUsdQuote) return [];
      return {
        base: base,
        quote: quote,
        time: curTime,
        price: parseFloat(ticker.lastPrice),
      }

    })
    return fmtTickers;
  }

  startProducer() {
    let client = new kafka.KafkaClient({kafkaHost: process.env.INTERNAL_KAFKA_ADDR, connectTimeout: 60000});
    let producer = new kafka.Producer(client)
    producer.on('ready', async () => {
      console.log("Binance ready")
      await this.fetchAllSymbols();
      setInterval(async () => await this.fetchAllSymbols(), 1000 * 60 * 60 * 24);

      setInterval(async () => {
        const markets = await this.fetchAllTickers();
        let allTickers = this.formatTicker(markets)
        console.log("Binance : " + JSON.stringify(allTickers[0]));
        let payload = [
          {
            topic: 'prices-events',
            messages: JSON.stringify(allTickers),
          }
        ];
        producer.send(payload, (err, data) => {
        })
      }, 5000);
      console.log("ready");
    });
    producer.on('error', (err: any) => {
      console.log(err);
    });
  }
}

export default BinanceProducer;

