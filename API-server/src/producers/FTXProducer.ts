import kafka from 'kafka-node';
import fetch from 'node-fetch-commonjs';
import {TickerData} from "./interfaces";

interface FtxRestResponse {
  success: boolean,
  result: FtxRestTickerData
}

interface FtxRestTickerData {
  name: string,
  enabled: boolean,
  postOnly: boolean,
  priceIncrement: number,
  sizeIncrement: number,
  minProvideSize: number,
  last: number,
  bid: number,
  ask: number,
  price: number,
  type: string,
  baseCurrency: string,
  quoteCurrency: string,
  underlying: string,
  restricted: boolean,
  highLeverageFeeExempt: boolean,
  largeOrderThreshold: number
  change1h: number,
  change24h: number,
  changeBod: number,
  quoteVolume24h: number,
  volumeUsd24h: number,
}

class FTXProducer {
  websocketURL;
  restURL;

  constructor() {
    this.websocketURL = "wss://ftx.com/ws/";
    this.restURL = "https://ftx.com/api";
  }

  /**
   * Fetches all binanceTickers for FTX's spot market
   */
  fetchAllTickers = async (): Promise<Array<FtxRestTickerData>> => {
    try {
      const response = await fetch(this.restURL + "/markets");
      const {result: tickers}: { result: Array<FtxRestTickerData> } = await response.json() as any;
      return tickers.filter((market: FtxRestTickerData) => market.type !== "future");
    } catch (err) {
      console.log(err);
      return []
    }
  }

  /**
   * Formats our data to a common format shared between exchanges
   * Removes non-USD quotes from our data
   * @param tickers : response of the fetchAllTickers function
   */
  formatTickers = (tickers: Array<FtxRestTickerData>): Array<TickerData> => {
    let curTime = new Date().getTime();
    let allTickers = tickers.flatMap((ticker: FtxRestTickerData) => {
      const tickArray = ticker.name.split("/");
      const base = tickArray[0];
      const quote = tickArray[1];
      const usdPairs = ["TUSD", "USDT", "USDC", "DAI","USD","UST"];
      const isUsdQuote = usdPairs.includes(quote);
      if(ticker.last===0||!isUsdQuote) return [];
      return {
        base: base,
        quote: quote,
        time: curTime,
        price: ticker.last,
      }
    });
    return allTickers;
  }

  startProducer() {
    let client = new kafka.KafkaClient({kafkaHost: process.env.INTERNAL_KAFKA_ADDR, connectTimeout: 60000});
    let producer = new kafka.Producer(client)
    producer.on('ready', async () => {
      console.log("FTX ready");
      setInterval(async () => {
        const ftxTickers = await this.fetchAllTickers();
        const allTickers = this.formatTickers(ftxTickers);
        console.log("FTX : " + JSON.stringify(allTickers[0]));
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
    producer.on(
      'error', (err: any) => {
        console.log(err);
      }
    );
  }
}

export default FTXProducer;
