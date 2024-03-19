import plugin from '../../../lib/plugins/plugin.js'
import xxCfg from '../model/xxCfg.js'
import Warframe from '../model/warframe.js'
import lodash from 'lodash'
import fs from 'node:fs'

const FROM_TYPE_GROUP = 1
const FROM_TYPE_PRIVATE = 2

const PUSH_TYPE_FISSURES = 'fissures'
const PUSH_TYPE_ALERTS = 'alerts'

let warframeSetFile = './plugins/trss-xianxin-plugin/config/warframe.set.yaml'
if (!fs.existsSync(warframeSetFile)) {
  fs.copyFileSync(
    './plugins/trss-xianxin-plugin/defSet/warframe/set.yaml',
    warframeSetFile
  )
}

let warframePushFile = './plugins/trss-xianxin-plugin/config/warframe.push.yaml'
if (!fs.existsSync(warframePushFile)) {
  fs.copyFileSync(
    './plugins/trss-xianxin-plugin/defSet/warframe/push.yaml',
    warframePushFile
  )
}

export class warframe extends plugin {
  constructor (e) {
    super({
      name: 'warframe虚空裂缝订阅',
      dsc: 'warframe虚空裂缝订阅',
      event: 'message',
      priority: 500,
      rule: [
        {
          reg: '^#*(开启|订阅|新增)warframe\\s*(裂缝\\s*|虚空裂缝\\s*|核桃\\s*)*.*$',
          fnc: 'addFissuresSubscribe'
        },
        {
          reg: '^#*(开启|订阅|新增)warframe\\s*(警报\\s*)*.*$',
          fnc: 'addAlertsSubscribe'
        }
      ]
    })

    this.warframeSetData = xxCfg.getConfig('warframe', 'set')
    this.warframePushData = xxCfg.getConfig('warframe', 'push')

    /** 定时任务 */
    this.task = {
      cron: this.warframeSetData.pushStatus
        ? this.warframeSetData.pushTime
        : '',
      name: 'trss-xianxin插件---warframe推送定时任务',
      fnc: () => this.runTask(),
      log: !!this.warframeSetData.pushTaskLog
    }
  }

  async runTask (data) {
    this.warframeSetData = xxCfg.getConfig('warframe', 'set')
    this.warframePushData = xxCfg.getConfig('warframe', 'push')
    let pushData = this.warframePushData
    let refreshType = new Set()
    logger.mark(`pushData: ${JSON.stringify(pushData)}`)
    for (let key in pushData) {
      const item = pushData[key]
      logger.mark(`item: ${JSON.stringify(item)}`)
      for (const type in item.type) {
        refreshType.add(type)
      }
    }
    if (refreshType.size == 0) {
      logger.mark('empty warframe task list, skip')
      return
    }
    logger.mark(`run warframe task: ${JSON.stringify(refreshType)}`)
    for (let x of refreshType) {
      switch (x) {
        case PUSH_TYPE_FISSURES:
          await this.doFissuresMsg(pushData)
          break
        default:
          break
      }
    }
  }

  async addFissuresSubscribe () {
    logger.mark('start addFissuresSubscribe')
    logger.mark(this.e)
    let data = this.warframePushData || {}
    let id
    let fromType
    if (this.e.isGroup) {
      id = this.e.group_id
      fromType = FROM_TYPE_GROUP
    } else if (this.e.isPrivate) {
      id = this.e.user_id
      fromType = FROM_TYPE_PRIVATE
    }
    if (!data[id]) {
      data[id] = {
        e_self_id: this.e.self_id,
        type: {},
        from: fromType
      }
    }
    const upData = data[id].type.get(PUSH_TYPE_FISSURES)
    if (upData) {
      this.e.reply('已经打开了哦 是要看现在有哪些订阅吗')
      return
    }
    data.id.type.fissures = []
    xxCfg.saveSet('warframe', 'push', 'config', data)
    this.e.reply('修改warframe虚空裂缝推送动态类型成功~')
  }

  async addAlertsSubscribe () {

  }

  async doFissuresMsg (pushData) {
    let model = new Warframe(this.e)
    const fissuresRes = await model.getFissureInfo()
    const fissuresJsonData = await fissuresRes.json()
    // logger.mark(fissuresJsonData)

    const allConfigMission = []

    for (let key in pushData) {
      const item = pushData[key]
      let mapList = item.type.fissures.map(_fissures => {
        return {
          ..._fissures,
          id: key,
          from: item.from,
          msg: ''
        }
      })
      allConfigMission.push(...mapList)
    }
    logger.mark(`doFissuresMsg, all allConfigMission:${JSON.stringify(allConfigMission)}`)
    for (let mission of fissuresJsonData) {
      for (let config of allConfigMission) {
        if ((config.node == undefined || mission.node.includes(config.node)) &&
                    (config.missionKey == undefined || mission.missionKey.toLowerCase() == config.missionKey.toLowerCase()) &&
                    (config.tierNum == undefined || mission.tierNum == config.tierNum) &&
            (config.isHard == undefined || mission.isHard == config.isHard) &&
            (config.isStorm == undefined || mission.isStorm == config.isStorm) &&
                    mission.expired == false) {
          let lastSendList = await redis.get(`xianxin:warframe:send_status:${config.id}_${config.from}_${mission.id}`)
          if (lastSendList) {
            logger.mark(`doFissuresMsg: mission_id=${mission.id}(${mission.node}${mission.missionType}) 已经推送过给${config.id}`)
            continue
          }
          let singleMsg = `${mission.isStorm ? '[九重天]' : ''}${mission.isHard ? '[钢铁之路]' : ''}${`[${mission.tier}]`}${mission.node}节点${mission.missionType}任务已经开启,剩余时间[${mission.eta}]\n`
          config.msg += singleMsg
          await redis.set(`xianxin:warframe:send_status:${config.id}_${config.from}_${mission.id}`, '1', { EX: 7200 * 10 })
        }
      }
    }

    const yunzaiName = await xxCfg.getYunzaiName()
    for (let config of allConfigMission) {
      if (config.msg == '') {
        continue
      }
      let finalMsg = '------warframe虚空裂缝状态推送-------\n' + config.msg
      let bot
      if (yunzaiName === 'miao-yunzai') {
        let uin = config.e_self_id
        bot = Bot[uin] ?? Bot
      } else if (yunzaiName === 'trss-yunzai') {
        bot = Bot
      }
      if (config.from == FROM_TYPE_GROUP) {
        await bot.pickGroup(String(config.id)).sendMsg(finalMsg)
          .catch((err) => {
            Bot.logger?.mark(`群/子频道[${config.id}]推送失败：${JSON.stringify(err)}`)
          })
      } else {
        await bot.pickFriend(String(config.id)).sendMsg(finalMsg)
          .catch((err) => {
            Bot.logger?.mark(`用户[${config.id}]推送失败：${JSON.stringify(err)}`)
          })
      }
    }
  }
}
