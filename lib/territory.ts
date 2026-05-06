export function detectTerritory(addr: string): string {
  const zip = addr.match(/\b(\d{5})\b/)?.[1]
  if (!zip) return 'WW'
  const CL = ['34711','34714','34715','34736','34737','34756','34705','34753']
  const WW = ['32162','32163','34484','34731','34785','33585','33513','33514','33538']
  if (CL.includes(zip)) return 'CL'
  if (WW.includes(zip)) return 'WW'
  return 'TV'
}
