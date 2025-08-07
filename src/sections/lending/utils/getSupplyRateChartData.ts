import { grafanaQuery } from "api/grafana"
import { zipArrays } from "utils/rx"

type ApiResponse = readonly [
  timestamps: Array<number>,
  reserves: Array<string>,
  borrowRates: Array<number>,
]

export type SupplyRateChartDataItem = {
  readonly timestamp: number
  readonly supplyRate: number
}

export const getSupplyRateChartData = async (
  assetId: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<Array<SupplyRateChartDataItem>> => {
  const data = (await grafanaQuery(
    `WITH rates AS (
SELECT 
timestamp, 
('x' || RIGHT(args->>'reserve', 8))::bit(32)::int as reserve, 
(args->>'liquidityRate')::numeric / 10^25 as supplyRate
FROM logs 
JOIN block ON block_number = block.height 
WHERE event_name = 'ReserveDataUpdated'
AND timestamp BETWEEN '${from}' AND '${to}'
),
bucketed_rates AS (
SELECT 
floor(extract(epoch from timestamp)/1800)*1800 as time,
reserve,
LAST(supplyRate ORDER BY timestamp) as supply_rate
FROM rates 
where reserve = ${assetId}
GROUP BY floor(extract(epoch from timestamp)/1800)*1800, reserve
)
SELECT 
time,
symbol,
supply_rate as supply_rate
FROM bucketed_rates
join token_metadata on id = reserve
WHERE reserve IS NOT NULL and supply_rate > 0
ORDER BY time ASC`,
    "price",
    signal,
  )) as ApiResponse

  return zipArrays(data[0], data[2]).map<SupplyRateChartDataItem>(
    ([timestamp, supplyRate]) => ({
      timestamp,
      supplyRate,
    }),
  )
}
