import FTX from "./FTX";
import {BalanceSnapshot} from "./types";
import dotenv from "dotenv"
import {calculateBalanceHistory} from "./balanceHistory";
dotenv.config();

const main = async () => {

  let ftxInstance = new FTX("FTX", process.env.apiKey!, process.env.apiSecret!);

  //TODO remove these lines once CEDE.store sends the messages and uncomment the other ones.
  const currentBalances = await ftxInstance.queryBalances(); //Start by getting current balances
  const events = await ftxInstance.queryEvents(); //Get all events (trades/deposit/withdrawal/borrows...), desc order


  const balanceHistory = calculateBalanceHistory(currentBalances,events);
  console.log(balanceHistory.reverse()[0]);
  // let balanceHistory: Array<BalanceSnapshot> = [currentBalances];
  // let prevIndex = 0;


}

main();