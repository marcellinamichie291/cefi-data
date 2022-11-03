import {
  BinanceWsTickerData,
  CoinbaseWsTickerData,
  TickerData,
  FtxWsTickerData
} from "./interfaces";

// export const formatFtxTicker2 = (ticker: FtxWsTickerData): TickerData => {
//   console.log()
//   return {
//     ticker: ticker.market.replace("-", "").replace("/", ""),
//     time: new Date(ticker.data.time).getTime(),
//     price: ticker.data.last,
//   }
// }

// export const formatFtxWsTicker = (ticker: FtxWsTickerData): TickerData => {
//   console.log()
//   return {
//     ticker: ticker.market.replace("-", "").replace("/", ""),
//     time: new Date(ticker.data.time).getTime(),
//     price: ticker.data.last,
//   }
// }

// export const formatBinanceWsTicker = (ticker: BinanceWsTickerData): TickerData => {
//   console.log(ticker);
//   return {
//     ticker: ticker.s.replace("-", "").replace("/", ""),
//     time: ticker.E,
//     price: parseFloat(ticker.c),
//   }
// }

export const formatCoinbaseWsTicker = (ticker: CoinbaseWsTickerData): TickerData => {
  console.log(ticker);
  let tickArray = ticker.product_id.split("-");
  let base = tickArray[0];
  let quote = tickArray[1];
  return {
    base: base,
    quote: quote,
    time: new Date(ticker.time).getTime(),
    price: parseFloat(ticker.price),
  }

}


