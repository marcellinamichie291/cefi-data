import BinanceProducer from "./BinanceProducer";
import CoinbaseProducer from "./CoinbaseProducer";
import FTXProducer from "./FTXProducer";


class ProducerOrcherster {

  binanceProducer;
  coinbaseProducer;
  ftxProducer;

  constructor() {
    this.binanceProducer = new BinanceProducer();
    this.coinbaseProducer = new CoinbaseProducer();
    this.ftxProducer = new FTXProducer();
  }

  startProducers() {
    this.binanceProducer.startProducer();
    this.ftxProducer.startProducer();
    this.coinbaseProducer.startProducer();
  }


}

export default ProducerOrcherster;
