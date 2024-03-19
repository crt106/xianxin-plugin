import base from './base.js'
import lodash from 'lodash'
import fetch from 'node-fetch'

const _headers = {
  authority: 'api.warframestat.us',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'accept-language': 'zh-CN,zh;q=0.9',
  'cache-control': 'max-age=0',
  'if-none-match': 'W/"247c-Bq+ERRFuLJR4MLyWISkRZ7STnos"',
  'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': 'macOS',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
}

export default class Warframe extends base {
  constructor (e) {
    super(e)
    this.model = 'warframe'
  }

  async getFissureInfo () {
    let url = 'https://api.warframestat.us/pc/fissures/?language=zh'
    const response = await fetch(url, {
      method: 'GET',
      headers: lodash.merge(_headers)
    })
    return response
  }

  async getInvasionInfo () {
    let url = 'https://api.warframestat.us/pc/invasions/?language=zh'
    const response = await fetch(url, {
      method: 'GET',
      headers: lodash.merge(_headers)
    })
    return response
  }

  async getAlertsInfo () {
    let url = 'https://api.warframestat.us/pc/alerts/?language=zh'
    const response = await fetch(url, {
      method: 'GET',
      headers: lodash.merge(_headers)
    })
    return response
  }
}
