import {
  BalanceSnapshot,
  BorrowEvent,
  DepositWithdrawEvent,
  FundingEvent,
  HistoricalEvent,
  TradeEvent,
  PnlEvent, actionOptions
} from "./types";


function handleDeposit(newBalances: BalanceSnapshot, event: DepositWithdrawEvent) {
  //Deposit : at time t-1(just before the event), we had prevBalance-evtAmount coins
  let prevAssetBalance = newBalances[event.asset];
  if (!prevAssetBalance) prevAssetBalance = 0;
  newBalances[event.asset] = nullifyLowAmounts(prevAssetBalance - event.amount + event.fee)
}

function handleWithdrawal(newBalances: BalanceSnapshot, event: DepositWithdrawEvent) {
  //Withdraw : at time t-1(just before the event), we had prevBalance+evtAmount coins
  let prevAssetBalance = newBalances[event.asset];
  if (!prevAssetBalance) prevAssetBalance = 0;
  newBalances[event.asset] = nullifyLowAmounts(prevAssetBalance + event.amount)  //no fee here, it's included in the amount
}

function handleSpotFill(newBalances: BalanceSnapshot, event: TradeEvent) {
  //Trade : at time t-1, behavior depend on the trade side
  let feeCurrencyBalance = newBalances[event.feeCurrency];
  if (!feeCurrencyBalance) feeCurrencyBalance = 0;
  newBalances[event.feeCurrency] = nullifyLowAmounts(feeCurrencyBalance + event.fee);
  let prevAssetBalance = newBalances[event.asset];
  if (!prevAssetBalance) prevAssetBalance = 0;
  let prevQuoteBalance = newBalances[event.quote];
  if (!prevQuoteBalance) prevQuoteBalance = 0;
  if (event.side === "buy") {
    newBalances[event.asset] = nullifyLowAmounts(prevAssetBalance - event.amount);
    newBalances[event.quote] = nullifyLowAmounts(prevQuoteBalance + (event.amount * event.price));
  } else {
    newBalances[event.asset] = nullifyLowAmounts(prevAssetBalance + event.amount);
    newBalances[event.quote] = nullifyLowAmounts(prevQuoteBalance - (event.amount * event.price));
  }
}

//handleFuturesFill is not used here : we consider a futures position to be a normal kind of trade
function handleFuturesFill(newBalances: BalanceSnapshot, event: TradeEvent) {
  // let feeCurrencyBalance = newBalances[event.feeCurrency];
//   if (!feeCurrencyBalance) feeCurrencyBalance = 0;
//   newBalances[event.feeCurrency] = nullifyLowAmounts(feeCurrencyBalance + event.fee);
//
}

function handleBorrow(newBalances: BalanceSnapshot, event: BorrowEvent) {
  let prevAssetBalance = newBalances[event.asset];
  if (!prevAssetBalance) prevAssetBalance = 0;
  newBalances[event.asset] = nullifyLowAmounts(prevAssetBalance + event.fee);
}

function handleFunding(newBalances: BalanceSnapshot, event: FundingEvent) {
  let prevAssetBalance = newBalances[event.asset];
  if (!prevAssetBalance) prevAssetBalance = 0;
  newBalances[event.asset] = nullifyLowAmounts(prevAssetBalance + event.fee);
}

//As stated previously, we won't analyze pnl - because we consider futures position to be
//equivalent to spot trades. therefore this function does nothing.
function handlePnl(newBalances: BalanceSnapshot, event: PnlEvent) {
  // let prevAssetBalance = newBalances[event.asset];
  // if (!prevAssetBalance) prevAssetBalance = 0;
  // newBalances[event.asset] = nullifyLowAmounts(prevAssetBalance - event.pnl);
}

/**
 * If the balance is really low we just fix it to 0
 * @param amount asset balance
 */
function nullifyLowAmounts(amount: number) {
  if (Math.abs(amount) < 10 ** -8) return 0;
  return amount;
}

const handleEvent = (balanceHistory: Array<BalanceSnapshot>, event: HistoricalEvent, prevIndex: number) => {
  let type = event.type;
  let timestamp = event.timestamp;
  //For each event, we get the state of the account at the previous event
  let prevBalances = balanceHistory[prevIndex];

  let newBalances: BalanceSnapshot = Object.assign({}, prevBalances);
  newBalances.timestamp = timestamp;
  //New map by copy to hold the new values
  //We get the event asset balance at previous event

  //We'll consider futures trades as basic trades - we won't use pnl analysis here
  let handleAction: actionOptions = {
    "deposit": handleDeposit,
    "withdrawal": handleWithdrawal,
    "trade": handleSpotFill,
    "futures": handleSpotFill,
    "borrow": handleBorrow,
    "funding": handleFunding,
    "pnl": handlePnl
  }
  handleAction[event.type](newBalances, event);
  balanceHistory = [...balanceHistory, newBalances];
  return balanceHistory;
}


/**
 * Calculates the historical account state after each event and returns an array
 * containing the timestamp and the state of the account at this timestamp
 * @param balanceHistory current balances of this account
 * @param event All historical account events : Fill/Futures/Withdraw/Deposit/Borrow/Funding
 */
export const calculateBalanceHistory = (currentBalances: BalanceSnapshot, events: Array<HistoricalEvent>): Array<BalanceSnapshot> => {
  let balanceHistory: Array<BalanceSnapshot> = [currentBalances];
  let prevIndex = 0;
  events.forEach((event: HistoricalEvent) => {
    balanceHistory = handleEvent(balanceHistory, event, prevIndex);
    ++prevIndex;
  });
  return balanceHistory;
}