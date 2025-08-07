import { grafanaQuery } from "api/grafana"
import { zipArrays } from "utils/rx"

type ApiResponse = readonly [
  timestamps: Array<number>,
  reserves: Array<string>,
  borrowRates: Array<number>,
]

export type VariableBorrowRateChartDataItem = {
  readonly timestamp: number
  readonly borrowRate: number
}

export const getVariableBorrowRateChartData = async (
  assetId: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<Array<VariableBorrowRateChartDataItem>> => {
  const data = (await grafanaQuery(
    `WITH rates AS (
SELECT 
timestamp, 
('x' || RIGHT(args->>'reserve', 8))::bit(32)::int as reserve, 
(args->>'variableBorrowRate')::numeric / 10^25 as borrowRate
FROM logs 
JOIN block ON block_number = block.height 
WHERE event_name = 'ReserveDataUpdated'
AND timestamp BETWEEN '${from}' AND '${to}'
),
bucketed_rates AS (
SELECT 
floor(extract(epoch from timestamp)/1800)*1800 as time,
reserve,
LAST(borrowRate ORDER BY timestamp) as borrow_rate
FROM rates 
where reserve = ${assetId}
GROUP BY floor(extract(epoch from timestamp)/1800)*1800, reserve
)
SELECT 
time,
symbol,
borrow_rate as borrow_rate
FROM bucketed_rates
join token_metadata on id = reserve
WHERE reserve IS NOT NULL and borrow_rate > 0
ORDER BY time ASC`,
    "price",
    signal,
  )) as ApiResponse

  return zipArrays(data[0], data[2]).map<VariableBorrowRateChartDataItem>(
    ([timestamp, borrowRate]) => ({
      timestamp,
      borrowRate,
    }),
  )
}
