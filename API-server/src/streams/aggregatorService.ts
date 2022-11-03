import {KafkaStreams} from "kafka-streams";
import kafka from "kafka-node";
import * as net from "net";

const client = new net.Socket()

export interface TickerData {
  base: string, //"BTC"
  quote: string, //"USD"
  time: number, //unix timestamp
  price: number,
}

//TODO : study config (group id, client id ?)
// Find best values for our use case
//cf logs :
// [2022-02-22 18:15:07,302] INFO [GroupCoordinator 1001]: Member kafka-streams-test-name-native-4f03bd1e-714d-4c05-a697-5aff02ca502f in group kafka-streams-test-native has failed, removing it from the group (kafka.coordinator.group.GroupCoordinator)
// [2022-02-22 18:15:07,317] INFO [GroupCoordinator 1001]: Stabilized group kafka-streams-test-native generation 32 (__consumer_offsets-39) with 1 members (kafka.coordinator.group.GroupCoordinator)
const config = {
  "noptions": {
    "metadata.broker.list": "kafka:9092",
    "group.id": "kafka-streams-test-native",
    "client.id": "kafka-streams-test-name-native",
    // "event_cb": true,
    // "compression.codec": "snappy",
    // "api.version.request": true,
    // "socket.keepalive.enable": true,
    // "socket.blocking.max.ms": 100,
    // "enable.auto.commit": false,
    // "auto.commit.interval.ms": 100,
    // "heartbeat.interval.ms": 250,
    // "retry.backoff.ms": 250,
    // "fetch.min.bytes": 100,
    // "fetch.message.max.bytes": 2 * 1024 * 1024,
    // "queued.min.messages": 100,
    // "fetch.error.backoff.ms": 100,
    // "queued.max.messages.kbytes": 50,
    // "fetch.wait.max.ms": 1000,
    // "queue.buffering.max.ms": 1000,
    // "batch.num.messages": 10000
  },
  "tconf": {
    "auto.offset.reset": "latest",
    // "request.required.acks": 1
  },
  "batchOptions": {
    // "batchSize": 5,
    // "commitEveryNBatch": 1,
    // "concurrency": 1,
    // "commitSync": false,
    // "noBatchCommits": false
  }
}
//@ts-ignore
const kafkaStreams = new KafkaStreams(config);
//@ts-ignore
kafkaStreams.on("error", (error) => console.error(error));
const kafkaTopicName = "prices-events";
const stream = kafkaStreams.getKStream(kafkaTopicName);
const AGGREGATE_INTERVAL = 30* 1000;

//stores the new updates it consumes
let newTickersUpdates: Array<Array<TickerData>> = [];
stream.forEach(message => {
  const msgData = (JSON.parse(message.value));
  newTickersUpdates.push(msgData);
});


stream.start().then(() => {
  console.log("stream started, as kafka consumer is ready.");
  let client = new kafka.KafkaClient({kafkaHost: process.env.INTERNAL_KAFKA_ADDR, connectTimeout: 60000});
  let producer = new kafka.Producer(client)
  producer.on('ready', async () => {
    setInterval(() => aggregateData(producer, newTickersUpdates), AGGREGATE_INTERVAL);
  });
}, error => {
  console.log("streamed failed to start: " + error);
});

interface PriceAggregator {
  priceAccumulator: number,
  dataAmount: number,
}

const aggregateData = (producer: kafka.Producer, data: Array<Array<TickerData>>) => {
  let final: Array<TickerData> = [];
  let priceAggregators: Map<string, PriceAggregator> = new Map();

  //The stream takes time to initiate
  //if data.length=0, we've got nothing to aggregate so we do nothing
  if (!data.length) return

  data.forEach(exchangeData => {
    exchangeData.forEach(tickerData => {
      const key = tickerData.base;
      let priceAggregator = priceAggregators.get(key);
      if (!priceAggregator) {
        priceAggregator = {
          priceAccumulator: 0,
          dataAmount: 0
        };
        priceAggregators.set(key, priceAggregator);
      }
      priceAggregator.priceAccumulator += tickerData.price;
      priceAggregator.dataAmount++;
    });
  });


  priceAggregators.forEach((aggregator, key) => {
    final.push({
      base: key,
      quote: "USD",
      time: Date.now(),
      price: aggregator.priceAccumulator / aggregator.dataAmount
    });
  });

  const usdPairs = ["TUSD", "USDT", "USDC", "DAI","USD","UST"];
  //TODO get real quotes here
  usdPairs.forEach((pair)=>{
    final.push({
      base: pair,
      quote: "USD",
      time: Date.now(),
      price: 1,
    });
  })

  console.log("aggregated data: " + JSON.stringify(final));

  newTickersUpdates = [];

  let payload = [
    {
      topic: 'prices-aggregated',
      messages: JSON.stringify(final),
    }
  ];
  producer.send(payload, (err, data) => {
  })

  storePrices(final);
}

/**
 * Stores the aggregated prices into a DB
 */
const storePrices = (prices: Array<TickerData>) => {
  prices.forEach(price => {
    client.write(`prices,base=${price.base},quote=${price.quote},value=${price.price} ${price.time}` + "\n", (err) => {
      if (err) {
        console.error(err)
        process.exit(1)
      }
    });
  });
}

const runDB = () => {
  client.connect(9009, "questdb", () => {
    console.log("Connected to QuestDB");
  });

  client.on("error", (err) => {
    console.error(err)
    process.exit(1)
  })

  client.on("close", () => {
    console.log("Connection closed")
  })
}
runDB();
