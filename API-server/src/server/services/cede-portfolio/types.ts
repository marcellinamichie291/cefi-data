export interface BalanceSnapshot {
  timestamp: number,

  [key: string]: number
}

export interface BaseEvent {
  timestamp: number,
  type: string,
  asset: string,
}

export interface TradeEvent extends BaseEvent {
  quote: string,
  amount: number,
  price: number,
  fee: number,
  side: string,
  feeCurrency: string,
  id: number,
  source: string
}

export interface DepositWithdrawEvent extends BaseEvent {
  amount: number,
  fee: number,
}

export interface FundingEvent extends BaseEvent {
  fee: number
}

export interface BorrowEvent extends BaseEvent {
  amount: number,
  fee: number
}

export interface PnlEvent extends BaseEvent {
  pnl: number
}

export type HistoricalEvent = TradeEvent & DepositWithdrawEvent & FundingEvent & BorrowEvent & PnlEvent & BaseEvent

export type actionOptions = {
  [key: string]: (newBalances: BalanceSnapshot, event: HistoricalEvent) => void
}