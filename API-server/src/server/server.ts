import {HttpRequest, HttpResponse, SSLApp, us_socket_context_t, WebSocket} from "uWebSockets.js"
import {v4} from "uuid"
import kafka, {Consumer} from 'kafka-node';
import ZerionSocket from "./ZerionSocket";
import {KafkaConsumer} from "node-rdkafka";
import {calculateBalanceHistory} from "./services/cede-portfolio/balanceHistory";
import dotenv from 'dotenv';

dotenv.config();

//TODO make interfaces docker-compatible
export interface TickerData {
  base: string, //"BTC"
  quote: string, //"USD"
  time: number, //unix timestamp
  price: number,
}

export interface ZerionRequest {
  scope: Array<string>,
  payload: any,
}

export interface ZerionResponse {
  meta: any,
  payload: any,
}

let zerionSocket = new ZerionSocket();
// let consumer: Consumer | undefined = undefined;
const server = SSLApp({
  key_file_name: 'cert/key.pem',
  cert_file_name: 'cert/cert.pem',
  passphrase: process.env.SSL_PASSPHRASE,
});
const port = Number(process.env.PORT || 7777);

const createConsumer = (topicName: string, partitionNum: number) => {
  var offset = new kafka.Offset(client);
  //Fetch last offset
  offset.fetch([{topic: topicName, partition: partitionNum, time: -1}], function (err, data) {
    let latestOffset = data[topicName][partitionNum][0];
    //init consumer from last offset
    let consumer = new Consumer(
      client, [{topic: topicName, partition: partitionNum, offset: latestOffset}], {
        autoCommit: false,
        fromOffset: true,
      });
    consumer.on('message', function (message) {
      const pricesUpdate: Array<TickerData> = JSON.parse(message.value as string);
      pricesUpdate.forEach((tickerData) => {
        cexServer.publish(tickerData.base, JSON.stringify(tickerData));
      })
    })
  });

}
const client = new kafka.KafkaClient({kafkaHost: process.env.INTERNAL_KAFKA_ADDR, connectTimeout: 60000});
client.on("ready", () => {
  console.log("ready")
  try {
    createConsumer('prices-aggregated', 0);
  } catch (err) {
    setTimeout(() => createConsumer('prices-aggregated', 0), 5000);
  }
});

const authorize = (res: HttpResponse, req: HttpRequest, next: us_socket_context_t) => {
  if (req.getQuery('token') === process.env.API_KEY) {
    res.upgrade(
      {ip: res.getRemoteAddressAsText()}, // 1st argument sets which properties to pass to ws object, in this case ip address
      req.getHeader('sec-websocket-key'),
      req.getHeader('sec-websocket-protocol'),
      req.getHeader('sec-websocket-extensions'), // 3 headers are used to setup websocket
      next // also used to setup websocket
    )
  } else {
    console.log(`Unauthorized connection from ${Buffer.from(res.getRemoteAddressAsText()).toString()}`)
    res.writeStatus("401 Invalid API Key");
    res.end();
  }
}

const cexServer = server.ws('/cex', {
  // config
  //TODO research on config to find an optimized one
  compression: 0,
  maxPayloadLength: 16 * 1024 * 1024,
  idleTimeout: 60,

  // check if the connection is authorized
  upgrade: authorize,

  message: (ws: WebSocket, message: ArrayBuffer, isBinary: boolean) => {
    //parse message
    try {
      let string = Buffer.from(message).toString();
      let {query, payload} = JSON.parse(string);
      switch (query) {
        case "prices":
          handleCEXPrices(ws, payload);
          break;
        case "portfolio":
          handlePortfolio(ws,payload);
        default:
          break;
      }
    } catch (err) {
      console.log(err);
      ws.send("error");
    }
  },

}).listen(port, token => {
  token ?
    console.log(`Listening to port ${port}`) :
    console.log(`Failed to listen to port ${port}`);
});

const zerionAssets = server.ws('/defi_assets', {

  // check if the connection is authorized
  upgrade: authorize,

  message: (ws: WebSocket, message: ArrayBuffer, isBinary: boolean) => {
    //parse message
    try {
      let string = Buffer.from(message).toString()
      let request = JSON.parse(string);
      handleZerionAssets(ws, request);
    } catch (err) {
      ws.send("error");
    }
  },

});

const zerionAddress = server.ws('/defi_address', {

  // check if the connection is authorized
  upgrade: authorize,

  message: (ws: WebSocket, message: ArrayBuffer, isBinary: boolean) => {
    //parse message
    try {
      let string = Buffer.from(message).toString()
      let request = JSON.parse(string);
      handleZerionAddress(ws, request);
    } catch (err) {
      ws.send("error");
    }
  },

});

/**
 * Subscribes our ws to the requested prices
 * @param ws
 * @param payload
 */
const handleCEXPrices = (ws: WebSocket, payload: Array<string>) => {
  if (!payload) return;
  let oldSubscriptions = ws.getTopics();
  //remove old subscriptions
  oldSubscriptions?.forEach((topic) => {
    ws.unsubscribe(topic);
  });
  //set new subscriptions
  payload.forEach((asset: string) => {
    ws.subscribe(asset);
  });
  //instantly send prices to ws
  sendLastPrices(ws, payload, "prices-aggregated", 0);
}


const sendLastPrices = (ws: WebSocket, payload: Array<string>, topicName: string, partitionNum: number) => {
  try {
    //Create new client (required to create a new consumer)
    const client = new kafka.KafkaClient({kafkaHost: process.env.INTERNAL_KAFKA_ADDR, connectTimeout: 60000});
    client.on("ready", () => {
      var offset = new kafka.Offset(client);
      //Fetch last offset
      offset.fetch([{topic: topicName, partition: partitionNum, time: -1}], function (err, data) {
        let latestOffset = data[topicName][partitionNum][0] - 1;
        //We create a consumer that will read the last message
        let consumer = new Consumer(
          client, [{topic: topicName, partition: partitionNum, offset: latestOffset}], {
            autoCommit: false,
            fromOffset: true,
          });
        //Our consumer will receive an event that is the last message stored inside the topic
        consumer.on('message', function (message) {
          const pricesUpdate: Array<TickerData> = JSON.parse(message.value as string);
          pricesUpdate.forEach((tickerData) => {
            if (payload.includes(tickerData.base)) ws.send(JSON.stringify(tickerData));
          })
          //We don't want to keep these open after sending the last prices
          consumer.close(() => {
          });
          client.close();
        })
      });

    });
  } catch (err) {
    console.log(err);
  }
}

const handleZerionAssets = async (ws: WebSocket, request: ZerionRequest) => {
  const response = await zerionSocket.getAsset(request)
    .then((response: ZerionResponse) => {
      return response.payload;
    });
  ws.send(JSON.stringify(response));
}

const handleZerionAddress = async (ws: WebSocket, request: ZerionRequest) => {
  const response = await zerionSocket.getAddress(request)
    .then((response: ZerionResponse) => {
      return response.payload;
    });
  ws.send(JSON.stringify(response));
}


const handlePortfolio = (ws:WebSocket,payload:any) => {
  console.log(payload)
  const {events,balances} = payload
  const balanceHistory = calculateBalanceHistory(balances,events);
  ws.send(JSON.stringify(balanceHistory));
}