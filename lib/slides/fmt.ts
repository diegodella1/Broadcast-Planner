/**
 * Number/currency formatters ported from backgroundclima/lib/fmt.ts
 * Used exclusively by slide components.
 */

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(amount)
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(amount)
}

export function formatBTC(btc: number): string {
  if (btc >= 1) {
    return `${btc.toLocaleString("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    })} BTC`
  }
  return `${btc.toLocaleString("en-US", {
    maximumFractionDigits: 8,
    minimumFractionDigits: 8
  })} BTC`
}

export function formatBTCMain(btc: number): string {
  return `${Math.round(btc).toLocaleString("en-US")} BTC`
}

export function formatSats(sats: number): { number: string; html: string } {
  const satoshiIcon = '<i class="fak fa-regular"></i>'
  let number: string
  if (sats >= 1_000_000) {
    number = `${(sats / 1_000_000).toFixed(2)}M`
  } else if (sats >= 1_000) {
    number = `${(sats / 1_000).toFixed(2)}K`
  } else {
    number = `${Math.round(sats).toLocaleString("en-US")}`
  }
  return { number, html: `${number} ${satoshiIcon} sats` }
}

export function formatChange24h(changePct: number): string {
  const sign = changePct >= 0 ? "+" : ""
  return `${sign}${changePct.toFixed(2)}%`
}
