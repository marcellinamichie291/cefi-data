

export function deserializeTsFromDate(strDate:string){
  return Math.floor((new Date(strDate)).getTime()/1000);
}
