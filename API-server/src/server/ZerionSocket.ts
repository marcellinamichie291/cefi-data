import {ZerionRequest, ZerionResponse} from "./server";

let io = require('socket.io-client')

class ZerionSocket {
  BASE_URL;
  assetSocket;
  addressSocket;
  address_namespaces;
  assets_namespaces;

  constructor() {
    this.BASE_URL = 'wss://api-v4.zerion.io/';
    this.assetSocket = {
      namespace: 'assets',
      socket: io(`${this.BASE_URL}assets`, {
        transports: ['websocket'],
        timeout: 60000,
        query: {
          api_token:
            'Cede.PjpU1Wb4wfsKWqMEMKUNo1FznoOOhjQh',
        },
      }),
    };

    this.addressSocket = {
      namespace: 'address',
      socket: io(`${this.BASE_URL}address`, {
        transports: ['websocket'],
        timeout: 60000,
        query: {
          api_token:
            'Cede.PjpU1Wb4wfsKWqMEMKUNo1FznoOOhjQh',
        },
      }),
    };

    this.assets_namespaces = ["prices", "explore-sections", "info", "full-info",
      "charts", "tags", "actions", "stats", "list", "tokenlists", "categories"];

    this.address_namespaces = ["info", "assets", "portfolio", "transactions", "charts",
      "deposits", "loans", "locked-assets", "staked-assets", "bsc-assets", "polygon-assets"];

  }

  verify(request: any, response: any) {
    // each value in request payload must be found in response meta
    return Object.keys(request.payload).every(key => {
      const requestValue = request.payload[key];
      const responseMetaValue = response.meta[key];
      if (typeof requestValue === 'object') {
        return JSON.stringify(requestValue) === JSON.stringify(responseMetaValue);
      }
      return responseMetaValue === requestValue;
    });
  }

  /**
   * Handles requests to the /asset namespace
   * @param requestBody
   */
  getAsset(requestBody: ZerionRequest): Promise<ZerionResponse> {
    return new Promise((resolve) => {
      console.log(requestBody);
      if (!(requestBody) || !(this.assets_namespaces.includes(requestBody.scope[0]))) resolve({
        meta: {},
        payload: "request error"
      });
      const {socket, namespace} = this.assetSocket;

      const handleReceive = (data: any) => {
        console.log(data);
        unsubscribe();
        resolve(data);
      }
      const model = requestBody.scope[0];

      function unsubscribe() {
        socket.off(`received ${namespace} ${model}`, handleReceive);
        socket.emit('unsubscribe', requestBody);
      }

      socket.emit('get', requestBody);
      socket.on(`received ${namespace} ${model}`, handleReceive);
    });
  }

  /**
   * Handles request to the /address namespace
   * @param requestBody
   */
  getAddress(requestBody: ZerionRequest): Promise<ZerionResponse> {
    return new Promise((resolve) => {
      if (!(requestBody) || !(this.address_namespaces.includes(requestBody.scope[0]))) resolve({
        meta: {},
        payload: "request error"
      });
      const {socket, namespace} = this.addressSocket;
      const handleReceive = (data: any) => {
        console.log(data)
        unsubscribe();
        resolve(data);
      }
      const model = requestBody.scope[0];

      function unsubscribe() {
        socket.off(`received ${namespace} ${model}`, handleReceive);
        socket.emit('unsubscribe', requestBody);
      }

      socket.emit('get', requestBody);
      socket.on(`received ${namespace} ${model}`, handleReceive);

    });
  }

  //TODO : Subscription to a namespace
}

export default ZerionSocket;
