export interface BinanceWsTickerData {
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

export interface FtxWsTickerData {
  channel: string,
  market: string,
  type: string,
  data: {
    bid: number,
    ask: number,
    bidSize: number,
    askSize: number,
    last: number,
    time: number,
  }
}

export interface CoinbaseWsTickerData {
  type: string,
  sequence: number,
  product_id: string,
  price: string,
  open_24h: string,
  volume_24h: string,
  low_24h: string,
  high_24h: string,
  volume_30d: string,
  best_bid: string,
  best_ask: string,
  side: string,
  time: string,
  trade_id: number,
  last_size: string,

}

//Stores info from a ticker
export interface Ticker {
  ticker: string, //"BTC/USD" or "BTCUSD" or anything else - depends on the provider
  baseAsset: string, //"BTC"
  quoteAsset: string //"USD"
}

export interface TickerData {
  base: string, //"BTC"
  quote: string, //"USD"
  time: number, //unix timestamp
  price: number,
}