import plugin from "../../../lib/plugins/plugin.js";
import fs from "node:fs";
import { segment } from "oicq";
import Game from "../model/game.js";
import moment from "moment";
import puppeteer from "../../../lib/puppeteer/puppeteer.js";
import xxCfg from "../model/xxCfg.js";

// PK信息存放
let pkArr = {};

// 五子棋信息存放
let gobangState = {};

let count = 0;

// 正在游戏的数据
let gameing = {};

let gobangTimer = {};

let gameSetFile = "./plugins/xianxin-plugin/config/game.set.yaml";
if (!fs.existsSync(gameSetFile)) {
  fs.copyFileSync("./plugins/xianxin-plugin/defSet/game/set.yaml", gameSetFile);
}

export class game extends plugin {
  constructor(e) {
    super({
      name: "群战小游戏",
      dsc: "群战小游戏",
      event: "message.group",
      priority: 500,
      rule: [
        {
          reg: "^#(我的|加入)?群战(信息)?$",
          fnc: "mypk",
        },
        {
          reg: "^#战榜$",
          fnc: "rank",
        },
        {
          reg: "^(#)?战$",
          fnc: "pk",
        },
        {
          reg: "^#战狂$",
          fnc: "time",
        },
        {
          reg: "^#逆天改命$",
          fnc: "chance",
        },
        {
          reg: "^#五子棋$",
          fnc: "startGobang",
        },
        {
          reg: "^(#)?落子[A-Za-z]+[0-9]+$",
          fnc: "drop",
        },
        {
          reg: "^#强制退出五子棋$",
          fnc: "forceGobang",
        },
      ],
    });

    this.path = "./data/pkJson/";
    this.gameSetData = xxCfg.getConfig("game", "set");
  }

  async init() {
    if (!fs.existsSync(this.path)) {
      fs.mkdirSync(this.path);
    }
  }

  /** 群号key */
  get grpKey() {
    return `Yz:group_id:${this.e.user_id}`;
  }

  async mypk() {
    await this.getGroupId();
    if (!this.group_id) return;

    this.initPkArr();

    if (!pkArr[this.group_id]) {
      this.register();
    }

    let pkInfo = pkArr[this.group_id].get(String(this.e.user_id));

    if (!pkInfo) {
      this.register();
      pkInfo = {
        nick: this.e.sender.card || this.e.user_id,
        exp: 100,
        time: 0,
        dayTime: 0,
        lastpk: moment().format("YYYYMMDD"),
      };
    }

    const data = await new Game(this.e).getMyPkData(pkInfo);

    const { level, info } = this.getLevel(pkInfo.exp);

    let img = await puppeteer.screenshot("mypk", {
      ...data,
      level,
      info,
      user_id: this.e.user_id,
      nick: this.e.sender.card || this.e.user_id,
    });
    this.e.reply(img);

    // this.reply(
    //   `昵称：${pkInfo.nick}\n战力：${pkInfo.exp}\n战阶：${this.getLevel(
    //     pkInfo.exp
    //   )}`
    // );
  }

  async pk() {
    await this.getGroupId();
    if (!this.group_id) return;

    this.initPkArr();

    if (!pkArr[this.group_id]) {
      this.reply("首次战斗，请先使用 #加入群战 注册群战信息");
      return;
    }

    let selfInfo = pkArr[this.group_id].get(String(this.e.user_id));

    if (!selfInfo) {
      this.reply("首次战斗，请先使用 #加入群战 注册群战信息");
      return;
    }

    if (moment().format("YYYYMMDD") !== selfInfo.lastpk) {
      selfInfo.dayTime = 0;
    }

    if (
      this.gameSetData.limitTimes !== 0 &&
      selfInfo.dayTime >= this.gameSetData.limitTimes
    ) {
      this.reply(
        `每日限制挑战次数为${this.gameSetData.limitTimes}次，请明日再战`
      );
      return;
    }

    const { enemy, enemyNick } = this.getEnemy();

    if (!enemy) {
      this.reply("没有对手的战斗，如何战斗。请发送#战@某位群友");
      return;
    }

    if (enemy === this.e.user_id) {
      this.reply("不可以和自己战斗哦，请@群中好友战斗");
      return;
    }

    let enemyInfo = pkArr[this.group_id].get(String(enemy));

    if (!enemyInfo) {
      this.reply("对手未注册群战信息，请先让对手使用 #加入群战 注册群战信息");
      return;
    }

    const retData = this.pkHandle(
      { ...selfInfo, user_id: this.e.user_id },
      { ...enemyInfo, user_id: enemy }
    );

    const { winner, loser } = retData;

    if (!winner && !loser) {
      this.reply("对手战力差距过大，触发战力保护机制无法进行挑战");
      return;
    }

    const message = [
      segment.at(this.e.user_id, this.e.sender.card || this.e.user_id),
    ];

    if (this.e.user_id == winner.user_id) {
      message.push(" 完胜");
      message.push(
        `\n战胜了对手，并获得战力${winner.tempExp}点，当前战力为${winner.exp}\n`
      );
      message.push(segment.at(enemy, enemyNick));
      message.push(" 惜败");
      message.push(
        `\n败给了对手，并损失战力${loser.tempExp}点，当前战力为${loser.exp}`
      );
    } else {
      message.push(" 惜败");
      message.push(
        `\n败给了对手，并损失战力${loser.tempExp}点，当前战力为${loser.exp}\n`
      );
      message.push(segment.at(enemy, enemyNick));
      message.push(" 完胜");
      message.push(
        `\n战胜了对手，并获得战力${winner.tempExp}点，当前战力为${winner.exp}`
      );
    }

    await this.reply(message);
  }

  async rank() {
    await this.getGroupId();
    if (!this.group_id) return;

    const players = this.getPlayers();

    if (!players || !players.length) {
      this.reply(`未找到玩家数据`);
      return;
    }

    const sortExpPlayers = players.sort(function (a, b) {
      return b.exp - a.exp;
    });

    const data = await new Game(this.e).getRankData(
      sortExpPlayers.slice(0, this.gameSetData.limitTop || 20)
    );

    let img = await puppeteer.screenshot("rank", {
      ...data,
      limitTop: this.gameSetData.limitTop || 20,
    });
    this.e.reply(img);
  }

  async time() {
    await this.getGroupId();
    if (!this.group_id) return;

    const players = this.getPlayers();

    if (!players || !players.length) {
      this.reply(`未找到玩家数据`);
      return;
    }

    const sortTimePlayers = players.sort(function (a, b) {
      return b.time - a.time;
    });

    const mostTimePlayer = sortTimePlayers[0];

    const data = await new Game(this.e).getTimeData(mostTimePlayer);

    let img = await puppeteer.screenshot("time", {
      ...data,
      level: "战狂",
    });
    this.e.reply(img);

    // this.reply(
    //   `当前战狂：${mostTimePlayer.nick}\n共战斗${mostTimePlayer.time}次，战力为${mostTimePlayer.exp}点`
    // );
  }

  async chance() {
    await this.getGroupId();
    if (!this.group_id) return;

    this.initPkArr();

    if (!pkArr[this.group_id]) {
      this.reply("首次战斗，请先使用 #加入群战 注册群战信息");
      return;
    }

    let selfInfo = pkArr[this.group_id].get(String(this.e.user_id));

    if (!selfInfo) {
      this.reply("首次战斗，请先使用 #加入群战 注册群战信息");
      return;
    }

    const players = this.getPlayers();

    if (!players || !players.length) {
      this.reply(`未找到玩家数据`);
      return;
    }

    const sortExpPlayers = players.sort(function (a, b) {
      return b.exp - a.exp;
    });

    const lowestExpPlayer = sortExpPlayers[players.length - 1];

    if (lowestExpPlayer.exp !== selfInfo.exp) {
      this.reply("技能为战力最低专属技能，您战力过高还需摆烂～");
      return;
    }

    /** cd 单位秒 */
    let cd = 60 * 60 * 24; // 一天
    let key = `Yz:gamechance:${this.e.group_id}${this.e.user_id}`;
    if (await redis.get(key)) {
      this.reply("今天已经用过这个技能了，一天只能用一次哦");
      return;
    }
    redis.set(key, "1", { EX: cd });

    const mostExpPlayer = sortExpPlayers[0];

    const randomMax = Math.round((mostExpPlayer.exp - lowestExpPlayer.exp) / 2);

    let tempExp = Math.floor(Math.random() * randomMax) + 1;

    pkArr[this.group_id].set(String(this.e.user_id), {
      ...selfInfo,
      exp: selfInfo.exp + tempExp,
    });

    this.saveJson();

    this.reply([
      segment.at(this.e.user_id, this.e.sender.card || this.e.user_id),
      ` 逆天改命技能使用成功，获得战力${tempExp}，当前战力为${
        selfInfo.exp + tempExp
      }`,
    ]);
  }

  async startGobang() {
    await this.getGroupId();
    if (!this.group_id) return;

    if (!gameing[this.group_id]) gameing[this.group_id] = {};

    if (gameing && gameing[this.group_id] && gameing[this.group_id].self) {
      this.e.reply("五子棋正在游戏中，请对局结束后再开局");
      return;
    }

    this.initArray();

    const state = gobangState[this.group_id];

    gameing[this.group_id].self = { user_id: this.e.sender.user_id };

    const data = await new Game(this.e).getGobangData({
      gobangData: JSON.stringify({ state: state }),
    });

    let img = await puppeteer.screenshot("gobang", {
      ...data,
      user_id: this.e.user_id,
    });

    const message = [
      `${this.e.sender.card || this.e.user_id} 发起了小游戏 五子棋！`,
      `\n发送“落子+字母+数字”下棋，如“落子A1”\n`,
      img,
    ];

    this.e.reply(message);
  }

  async drop() {
    await this.getGroupId();
    if (!this.group_id) return;

    if (!gameing[this.group_id] || !gameing[this.group_id].self) {
      this.e.reply("当前没有进行中的五子棋小游戏，发送#五子棋，开一局吧");
      return;
    }

    if (
      gameing[this.group_id] &&
      gameing[this.group_id].self &&
      gameing[this.group_id].self.user_id !== this.e.sender.user_id &&
      !gameing[this.group_id].enemy
    ) {
      gameing[this.group_id].enemy = { user_id: this.e.sender.user_id };
    }

    // 如果不是对战的两个人那么直接拦截
    if (
      ![
        gameing[this.group_id].self.user_id,
        (gameing[this.group_id].enemy &&
          gameing[this.group_id].enemy.user_id) ||
          "",
      ].includes(this.e.sender.user_id)
    ) {
      return;
    }

    if (
      count == 0 &&
      gameing[this.group_id].self.user_id !== this.e.sender.user_id
    ) {
      this.e.reply("本轮请黑棋落子");
      return;
    }

    if (
      count == 1 &&
      ((gameing[this.group_id].enemy && gameing[this.group_id].enemy.user_id) ||
        "") !== this.e.sender.user_id
    ) {
      this.e.reply("本轮请白棋落子");
      return;
    }

    const position = this.e.msg.replace("#", "").replace("落子", "").trim();

    let y = position.substr(0, 1).toUpperCase();
    const x = position.slice(1) - 1;

    y = Number(y.charCodeAt(0) - 65);

    if (x < 0 || x > 15 || y < 0 || y > 15) {
      this.e.reply("落子失败，不是有效棋盘位置");
      return;
    }

    if (gobangState[this.group_id][x][y] != -1) {
      this.e.reply("该位置已落子，请选择其他位置落子");
      return;
    }

    this.dropArray({ x, y });
    // gobangState[1][2] = 1;
    // gobangState[6][2] = 0;

    const data = await new Game(this.e).getGobangData({
      gobangData: JSON.stringify({ state: gobangState[this.group_id] }),
    });

    let img = await puppeteer.screenshot("gobang", {
      ...data,
      user_id: this.e.user_id,
    });

    const info = this.getRule(x, y);

    if (count == 0) {
      count = 1;
    } else {
      count = 0;
    }

    if (info != "gaming") {
      gameing[this.group_id] = {};
      count = 0;
      gobangState[this.group_id] = new Array();

      const message = [
        `${this.e.sender.card || this.e.user_id} 获得胜利，恭喜！`,
        img,
      ];
      this.e.reply(message);
      return;
    }

    this.e.reply(img);
  }

  async forceGobang() {
    await this.getGroupId();
    if (!this.group_id) return;

    if (!this.e.isMaster) return;

    gameing[this.group_id] = {};
    count = 0;
    gobangState[this.group_id] = new Array();

    this.e.reply("已强制退出本轮五子棋");
  }

  initArray() {
    if (!gobangState[this.group_id]) gobangState[this.group_id] = new Array();
    for (var i = 0; i < 15; i++) {
      gobangState[this.group_id][i] = new Array();
      for (var j = 0; j < 15; j++) {
        gobangState[this.group_id][i][j] = -1;
      }
    }
  }

  dropArray(position) {
    if (!gobangState[this.group_id]) gobangState[this.group_id] = new Array();

    const { x, y } = position;

    for (var i = 0; i < 15; i++) {
      if (!gobangState[this.group_id][i])
        gobangState[this.group_id][i] = new Array();
      for (var j = 0; j < 15; j++) {
        if (y == j && x == i) {
          gobangState[this.group_id][i][j] = count;
        }
      }
    }
  }

  getRule(ix, iy) {
    const state = gobangState[this.group_id];
    const s = count;
    var hc = 0,
      vc = 0,
      rdc = 0,
      luc = 0; //horizontal
    for (var i = ix; i < 15; i++) {
      if (state[i][iy] != s) {
        break;
      }
      hc++;
    }
    for (var i = ix - 1; i >= 0; i--) {
      if (state[i][iy] != s) {
        break;
      }
      hc++;
    } //vertical
    for (var j = iy; j < 15; j++) {
      if (state[ix][j] != s) {
        break;
      }
      vc++;
    }
    for (var j = iy - 1; j >= 0; j--) {
      if (state[ix][j] != s) {
        break;
      }
      vc++;
    } //rightdown
    for (var i = ix, j = iy; i < 15 && j < 15; i++, j++) {
      if (state[i][j] != s) {
        break;
      }
      rdc++;
    }
    for (var i = ix - 1, j = iy - 1; i >= 0 && j >= 0; i--, j--) {
      if (state[i][j] != s) {
        break;
      }
      rdc++;
    } //leftup
    for (var i = ix, j = iy; i < 15 && j >= 0; i++, j--) {
      if (state[i][j] != s) {
        break;
      }
      luc++;
    }
    for (var i = ix - 1, j = iy + 1; i >= 0 && j < 15; i--, j++) {
      if (state[i][j] != s) {
        break;
      }
      luc++;
    }
    if (hc == 5 || vc == 5 || rdc == 5 || luc == 5) {
      if (s == 0) {
        return gameing[this.group_id].self;
      } else {
        return gameing[this.group_id].enemy;
      }
    }

    return "gaming";
  }

  getPlayers() {
    this.initPkArr();

    if (!pkArr[this.group_id]) pkArr[this.group_id] = new Map();

    let playerArr = [];

    for (let [k, v] of pkArr[this.group_id]) {
      const { level, info } = this.getLevel(v.exp);
      playerArr.push({ ...v, user_id: k, level, info });
    }
    return playerArr;
  }

  async register() {
    this.initPkArr();

    if (!pkArr[this.group_id]) pkArr[this.group_id] = new Map();

    pkArr[this.group_id].set(String(this.e.user_id), {
      nick: this.e.sender.card || this.e.user_id,
      exp: 100,
      time: 0,
      dayTime: 0,
      lastpk: moment().format("YYYYMMDD"),
    });

    this.saveJson();
  }

  /** pk处理 */
  pkHandle(self, enemy) {
    if (!pkArr[this.group_id]) pkArr[this.group_id] = new Map();

    const { exp: selfExp, time: selfTime = 0, dayTime: selfDayTime = 0 } = self;

    const {
      exp: enemyExp,
      time: enemyTime = 0,
      dayTime: enemyDayTime = 0,
    } = enemy;

    let winner = null;
    let loser = null;
    let loserReduce = 0;

    const totalExp = selfExp + enemyExp;

    let probability = Number(selfExp / totalExp).toFixed(2);

    let randomNum = Math.random().toFixed(2);

    let tempSelfExp = selfExp;
    let tempEnemyExp = enemyExp;

    // let addition = 1;

    // if (selfExp / enemyExp > 2) {
    //   addition = Math.ceil(selfExp / enemyExp);
    //   probability = Number(probability / addition).toFixed(2);
    // } else if (enemyExp / selfExp > 2) {
    //   addition = Math.ceil(enemyExp / selfExp);
    //   probability = Number(probability * addition).toFixed(2);
    // }

    if (probability > 0.9 || probability < 0.1) {
      return { winner: undefined, loser: undefined };
    }

    if (randomNum > probability) {
      // 输了
      // 扣减的经验值为对手的1/10经验
      let reduce = Math.round(selfExp * 0.1);

      if (reduce > enemyExp) {
        reduce = enemyExp;
      }

      tempSelfExp = selfExp - reduce;
      tempEnemyExp = enemyExp + reduce;
      loserReduce = reduce;

      if (tempSelfExp < 10) {
        loserReduce = tempSelfExp - 10;
        tempSelfExp = 10;
      }

      winner = { ...enemy, exp: tempEnemyExp, tempExp: reduce };
      loser = { ...self, exp: tempSelfExp, tempExp: loserReduce };
    } else {
      // 赢了
      // 增加的经验值为对手的1/10经验
      let add = Math.round(enemyExp * 0.1);

      // 如果增加的经验值比自己全部的经验都多，那么自己的经验最多翻倍
      if (add > selfExp) {
        add = selfExp;
      }

      tempSelfExp = selfExp + add;

      tempEnemyExp = enemyExp - add;

      loserReduce = add;
      if (tempEnemyExp < 10) {
        tempEnemyExp = 10;
        loserReduce = tempEnemyExp - 10;
      }

      winner = { ...self, exp: tempSelfExp, tempExp: add };
      loser = { ...enemy, exp: tempEnemyExp, tempExp: loserReduce };
    }

    pkArr[this.group_id].set(String(self.user_id), {
      ...self,
      nick: self.nick,
      exp: tempSelfExp,
      time: selfTime + 1,
      dayTime: selfDayTime + 1,
      lastpk: moment().format("YYYYMMDD"),
    });

    pkArr[this.group_id].set(String(enemy.user_id), {
      ...enemy,
      nick: enemy.nick,
      exp: tempEnemyExp,
      time: enemyTime,
      dayTime: enemyDayTime,
    });

    this.saveJson();
    return { winner, loser };
  }

  getEnemy() {
    let message = this.e.message;

    let enemy = "";
    let enemyNick = "";

    for (let i in message) {
      if (message[i].type == "at") {
        enemy = message[i].qq;
        enemyNick = message[i].text.replace("@", "");
      }
    }
    return { enemy, enemyNick };
  }

  /** 初始化群战信息 */
  initPkArr() {
    if (pkArr[this.group_id]) return;

    pkArr[this.group_id] = new Map();

    let path = `${this.path}${this.group_id}.json`;
    if (!fs.existsSync(path)) {
      return;
    }

    try {
      let pkMapJson = JSON.parse(fs.readFileSync(path, "utf8"));
      for (let key in pkMapJson) {
        pkArr[this.group_id].set(String(key), pkMapJson[key]);
      }
    } catch (error) {
      logger.error(`json格式错误：${path}`);
      delete pkArr[this.group_id];
      return;
    }
  }

  /** 获取群号 */
  async getGroupId() {
    if (this.e.isGroup) {
      this.group_id = this.e.group_id;
      redis.setEx(this.grpKey, 3600 * 24 * 30, String(this.group_id));
      return this.group_id;
    }

    // redis获取
    let groupId = await redis.get(this.grpKey);
    if (groupId) {
      this.group_id = groupId;
      return this.group_id;
    }

    return;
  }

  getLevel(exp) {
    if (exp === 10) {
      return { level: "战渣", info: "战至成渣～" };
    }
    if (exp < 51) {
      return { level: "战尘", info: "微尘亦战～" };
    }
    if (exp < 151) {
      return { level: "战士", info: "骁勇善战" };
    }
    if (exp < 301) {
      return { level: "战将", info: "一将功成万骨枯～" };
    }
    if (exp < 601) {
      return { level: "战王", info: "何人敢与我一战！" };
    }

    if (exp < 1001) {
      return { level: "战圣", info: "高处不胜寒！" };
    }

    if (exp > 1000) {
      return { level: "战神", info: "无敌无我～" };
    }

    return { level: "战x", info: "xxxx" };
  }

  /** 保存json文件 */
  saveJson() {
    let obj = {};
    for (let [k, v] of pkArr[this.group_id]) {
      obj[k] = v;
    }

    fs.writeFileSync(
      `${this.path}${this.group_id}.json`,
      JSON.stringify(obj, "", "\t")
    );
  }
}
