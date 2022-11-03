import kafka from 'kafka-node';
import {WebSocket} from "ws";
import {CoinbaseWsTickerData, FtxWsTickerData, TickerData} from "./interfaces";
import fetch from 'node-fetch-commonjs';

interface FormattedTickerData {
  base: string;
  quote: string;
  time: number;
  price: number;
}

const usdPairs = ["TUSD", "USDT", "USDC", "DAI","USD","UST"];
class CoinbaseProducer {
  websocketURL;
  restURL;
  allTickers: Array<FormattedTickerData>;

  constructor() {
    this.websocketURL = "wss://ws-feed.exchange.coinbase.com";
    this.restURL = "https://api.exchange.coinbase.com";
    this.allTickers = [];
  }

  fetchAllMarkets = async () => {
    const response = await fetch(this.restURL + "/products");
    const markets = await response.json() as any;
    const marketTickers = markets.map((market: any) => {
      return market.id;
    })
    return marketTickers;
  }

  formatCoinbaseWsTicker = (ticker: CoinbaseWsTickerData): TickerData => {
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

  sendToKafka = (producer: kafka.Producer) => {
    console.log("Coinbase : " + JSON.stringify(this.allTickers[0]));
    let payload = [
      {
        topic: 'prices-events',
        messages: JSON.stringify(this.allTickers),
      }
    ];
    producer.send(payload, (err, data) => {

    })
    this.allTickers = [];
  }

  startProducer() {
    let client = new kafka.KafkaClient({kafkaHost: process.env.INTERNAL_KAFKA_ADDR, connectTimeout: 60000});
    let producer = new kafka.Producer(client)
    const ws = new WebSocket(this.websocketURL);

    producer.on('ready', () => {
      ws.on('open', async () => {
        const markets = await this.fetchAllMarkets();
        ws.send(JSON.stringify({
          "type": "subscribe",
          "channels": [{"name": "ticker", "product_ids": markets}]
        }));
        setInterval(() => this.sendToKafka(producer), 5 * 1000);
      });
      console.log("Coinbase ready");
      ws.on('message', (data: string) => {
        if (data) {
          const coinbaseTicker = JSON.parse(data); // parsing single-trade record
          if (coinbaseTicker?.type !== "ticker") return;
          const ticker = this.formatCoinbaseWsTicker(coinbaseTicker);
          const isUsdQuote = usdPairs.includes(ticker.quote);
          if(ticker.price===0||!isUsdQuote) return;
          this.allTickers = [...this.allTickers, ticker];
        }
      });
    });

    producer.on('error', (err: any) => {
      console.log(err);
    });
  }
}

export default CoinbaseProducer;
