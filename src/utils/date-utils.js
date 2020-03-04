import dayjs from '../lib/dayjs'

const KNOWN_FORMATS = {
  iso: 'YYYY-MM-DDTHH:mm:ssZ',
  standard: 'D MMM YY, h:mm A',
  onlyDate: 'DD/MM/YY',
}

export function dateFormat(date, format) {
  return dayjs(date).format(KNOWN_FORMATS[format] || format)
}
