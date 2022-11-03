import airflow
import datetime
import json
import ccxt
from airflow import DAG
from airflow.operators.dummy_operator import DummyOperator
from airflow.operators.python_operator import PythonOperator
from airflow.operators.postgres_operator import PostgresOperator

from faker import Faker
import pandas as pd
import requests
import csv
import random
import time


outputFolder = "/opt/airflow/dags/"
apiUrl = "https://www.dnd5eapi.co/api"


default_args_dict = {
    'start_date': airflow.utils.dates.days_ago(0),
    'concurrency': 1,
    'schedule_interval': "* * * * *",
    'retries': 1,
    'retry_delay': datetime.timedelta(minutes=5),
}

prices_dag = DAG(
    dag_id='exchanges_dag',
    default_args=default_args_dict,
    schedule_interval = "* * * * *",
    catchup=False,
)

# ------- 1 ------- # Name
bitmex = ccxt.bitmex()
binance = ccxt.binance()
kraken = ccxt.kraken()




def getTickers(ti):
    binance_prices = binance.fetch_tickers();
    ti.xcom_push(key="binance_prices", value=binance_prices)
    print(binance_prices)


task_one = PythonOperator(
    task_id='get_tickers',
    dag=prices_dag,
    trigger_rule='all_success',
    python_callable=getTickers
)

# ------- 9 ------- # Data to CSV


def valuesToCSV(ti):


    binance_tickers = ti.xcom_pull(key="binance_prices", task_ids=["get_tickers"])[0]
    dataArray = []
    for ticker in binance_tickers.values():
        dataArray.append(ticker)

    df = pd.DataFrame.from_records(dataArray)
    df.to_csv(path_or_buf=outputFolder + "binance_prices.csv", sep=';')



task_two = PythonOperator(
    task_id='values_to_csv',
    dag=prices_dag,
    trigger_rule='all_success',
    python_callable=valuesToCSV
)

# ------- 10 ------- # Create SQL Request File

def create_insert_query():
    global outputFolder
    fileName = "binance_prices"
    df = pd.read_csv(
        f'{str(outputFolder)}/{str(fileName)}.csv', sep=';')  # TODO
    with open(f'/opt/airflow/dags/{str(fileName)}_inserts.sql', "w") as f:
        df_iterable = df.iterrows()
        f.write(
            f'CREATE TABLE IF NOT EXISTS {str(fileName)} (\n'
            "symbol VARCHAR(255),\n"
            "timestamp VARCHAR(255),\n"
            "datetime VARCHAR(255),\n"
            "high VARCHAR(255),\n"
            "low VARCHAR(255),\n"
            "bid VARCHAR(255),\n"
            "ask VARCHAR(255),\n"
            "askVolume VARCHAR(255),\n"
            "vwap VARCHAR(255),\n"
            "openPrice VARCHAR(255));\n"
        )

        for index, row in df_iterable:
            symbol = row['symbol']
            timestamp = row['timestamp']
            datetime = row['datetime']
            high = row['high']
            low = row['low']
            bid = row['bid']
            ask = row['ask']
            askVolume = row['askVolume']
            vwap = row['vwap']
            openPrice = row['open']

            f.write(
                f'INSERT INTO {str(fileName)} VALUES ('
                f"'{symbol}', '{timestamp}', '{datetime}',  '{high}', '{low}', '{bid}', '{ask}', '{askVolume}', '{vwap}', '{openPrice}'"
                ");\n"
            )

        f.close()


task_three = PythonOperator(
    task_id='create_insert_query',
    dag=prices_dag,
    python_callable=create_insert_query,
    trigger_rule='all_success',
)


# ------- 11 ------- # Execute the SQL file

task_four = PostgresOperator(
    task_id='insert_tickers',
    dag=prices_dag,
    postgres_conn_id='postgres_default',
    sql='binance_prices_inserts.sql',
    trigger_rule='all_success',
    autocommit=True
)

task_one >> task_two >> task_three >> task_four