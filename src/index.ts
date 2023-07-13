import { Context, Schema, Bot, Session } from 'koishi'
import WebSocket from 'ws'
import * as import_satori2 from "@satorijs/satori";
import * as import_satori7 from "@satorijs/satori";
import qface from 'qface';
import groupMessageHandle from './group/sessionHandle';


// 定义一个空的 WebSocket Set 对象
const websockets: Set<WebSocket> = new Set();

class Launcher {
  constructor(ctx: Context, config: Launcher.Config) {
    // bot-status-updated 不是会话事件
    // 所以回调函数接受的参数不是 session 而是 bot
    ctx.on('bot-status-updated', (bot: Bot) => {
      if (bot.status === 'online') {
        startup(bot, config)
      }
    })
    ctx.middleware((session, next) => {
      if (session.elements && session.elements.length > 0) {
        const data = adaptData(session);
        dispatch(data, ctx.bots[1], config);
      }
    });
    ctx.on('dispose', () => {
      // 在插件停用时关闭ws
      for (let ws of websockets) {
        ws.close();
        websockets.delete(ws);
      }
    });
  }
}

namespace Launcher {
  export interface Config {
    path?: string
    port?: string
    type?: string
    log?: boolean
  }
  export const Config: Schema<Config> = Schema.object({
    path: Schema.string().role('link').description('早苗服务器的地址</br>由于本插件本身是一个转接器,所以也可以是其他的ob11应用端(开始套娃!)').default('ws://101.35.247.237'),
    port: Schema.string().description('早苗服务器的端口</br>范围20001~20150,每个端口对应不同的存档,所以请牢记地址与端口的组合,遗忘会丢失早苗存档.请手动指定一个数字,而不要都使用20002').default('20002'),
    log: Schema.boolean().default(false).description('日志开关,上面的设置每次修改后,重启koishi才会生效.')
  });
  
  export const name = 'sanae'

  export const usage = `
## 基本指令

开启指令是\`早苗on\`
关闭指令是\`早苗off\`
帮助指令是\`/help\`

| 端口范围  | 人物  |
|-------|------|
| 20001~20050  | 早苗  |
| 20050~20070  | 澪   |
| 20071~20099  | 浅羽  |
| 20099-20120  | 浅羽  |
| 20120-20150   | 澪   |

## 指令文档

[https://yuque.com/km57bt/hlhnxg/](https://yuque.com/km57bt/hlhnxg/)

## 其它

这个插件可以结合存储库另一个项目载入epl插件（mpq-sdk）
`;
}

export default Launcher;

/**
 * 启动
 */
function startup(bot: Bot, config: Launcher.Config): void {
  //弄个koishi储存配置的东西
  setInterval(() => {
    const json = JSON.stringify({
      self_id: bot.config.selfId,
      time: Math.floor(Date.now() / 1000),
      post_type: "meta_event",
      meta_event_type: "heartbeat",
      interval: 50000,
    });
    websockets.forEach((ws: WebSocket) => {
      ws.send(json);
    });
  }, 5000);
  //filter(config.event_filter);
  createReverseWS(bot, config);
}

/**
 * 创建http&ws服务器
 */
/* function createServer(bot: Bot): void {
    let wss: WebSocket.Server;
        wss = new WebSocket.Server({server});
        wss.on("error", ()=>{});
        wss.on("connection", (ws: WebSocket, req: http.IncomingMessage)=>{
            ws.on("error", ()=>{});
            console.log('连接ws-148-core.js')
            onWSOpen(ws,bot);
        });
} */


/**
 * 分发事件
 */
export function dispatch(event: adaptDataType, bot: Bot, config: Launcher.Config): void {
  //if (!assert(event)) return;
  let cache: any[] = [];
  const json = JSON.stringify(event, function (key, value) {
    if (typeof value === 'object' && value !== null) {
      if (cache.indexOf(value) !== -1) {
        return;
      }
      cache.push(value);
    }
    return value;
  });
  cache = null; // 释放 cache
  websockets.forEach(ws => {
    if (config.log) {
      console.log(` 反向WS(${ws.url})上报事件: ` + json);
    }
    ws.send(json);
  });
}

/**
 * 创建反向ws
 */
export function createReverseWS(bot: Bot, config: Launcher.Config): void {
  let wsrCreated = true;
  const headers = {
    "X-Self-ID": bot.config.selfId,
    "X-Client-Role": "Universal",
    "User-Agent": "OneBot"
  };
  createWSClient(config.path + ":" + config.port, headers, bot, config);
  // for (let url of config.ws_reverse_url) {
  //     createWSClient(url, headers);
  // }
}

function createWSClient(url: string, headers: WebSocket.ClientOptions['headers'], bot: Bot, config: Launcher.Config): void {
  try {
    const ws = new WebSocket(url, { headers });
    ws.on("error", () => { });
    ws.on("open", () => {
      console.log(`反向ws连接(${url})连接成功。`);
      websockets.add(ws);
      onWSOpen(ws, bot, config);
    });
    ws.on("close", (code) => {
      websockets.delete(ws);
      // if ((code === 1000 && config.ws_reverse_reconnect_on_code_1000 === false) || config.ws_reverse_reconnect_interval < 0) {
      //     return console.log(`反向ws连接(${url})被关闭，关闭码${code}。不再重连。`);
      // }
      console.log(`反向ws连接(${url})被关闭，关闭码${code}，将在${5000}毫秒后尝试连接。`);
      setTimeout(() => {
        createWSClient(url, headers, bot, config);
        //}, config.ws_reverse_reconnect_interval);
      }, 5000);
    });
  } catch (e) {
    console.log(e.message);
  }
}


/**
 * ws连接建立
 * @param {WebSocket} ws 
 */
function onWSOpen(ws: WebSocket, bot: Bot, config: Launcher.Config): void {
  ws.on("message", (data: WebSocket.Data) => {
    onWSMessage(ws, data, bot, config);
  });
  ws.send(JSON.stringify({
    self_id: bot.config.selfId,
    time: Math.floor(Date.now() / 1000),
    post_type: "meta_event",
    meta_event_type: "lifecycle",
    sub_type: "connect",
  }));
  ws.send(JSON.stringify({
    self_id: bot.config.selfId,
    time: Math.floor(Date.now() / 1000),
    post_type: "meta_event",
    meta_event_type: "lifecycle",
    sub_type: "enable",
  }));
}

/**
 * 收到ws消息
 * @param {WebSocket} ws 
 */
async function onWSMessage(ws: WebSocket, data: WebSocket.Data, bot: Bot, config: Launcher.Config): Promise<void> {
  if (config.log)
    console.log(`收到WS消息: ` + data);
  try {
    const jsonString = data.toString();
    bot.socket.send(jsonString, (error) => {
      if (error)
        console.log(error);
    });
    let ret: string;
    const newRet = {
      retcode: 0,
      status: "ok",
      data: "balabla"
    };
    ret = JSON.stringify(newRet);
    ws.send(ret);
  } catch (e) {
    const retcode = 1400;
    ws.send(JSON.stringify({
      retcode: retcode,
      status: "failed",
      data: null,
      echo: (typeof data === 'string') ? JSON.parse(data)?.echo : undefined
    }));
  }
}

//构造koishi喜欢吃的session 待用
async function adaptSession(bot: Bot, data: any): Promise<Session> {
  const session = bot.session();
  session.selfId = data.self_tiny_id ? data.self_tiny_id : "" + data.self_id;
  session.type = data.post_type;
  if (data.post_type === "message" || data.post_type === "message_sent") {
    await adaptMessage(bot, data, session);
    if (data.post_type === "message_sent" && !session.guildId) {
      session.channelId = "private:" + data.target_id;
    }
    session.type = "message";
    session.subtype = data.message_type === "guild" ? "group" : data.message_type;
    session.subsubtype = data.message_type;
    return session;
  }
  session.subtype = data.sub_type;
  if (data.user_id)
    session.userId = "" + data.user_id;
  if (data.group_id)
    session.guildId = session.channelId = "" + data.group_id;
  if (data.guild_id)
    session.guildId = "" + data.guild_id;
  if (data.channel_id)
    session.channelId = "" + data.channel_id;
  if (data.target_id)
    session.targetId = "" + data.target_id;
  if (data.operator_id)
    session.operatorId = "" + data.operator_id;
  if (data.message_id)
    session.messageId = "" + data.message_id;
  if (data.post_type === "request") {
    session.content = data.comment;
    session.messageId = data.flag;
    if (data.request_type === "friend") {
      session.type = "friend-request";
      session.channelId = `private:${session.userId}`;
    } else if (data.sub_type === "add") {
      session.type = "guild-member-request";
    } else {
      session.type = "guild-request";
    }
  } else if (data.post_type === "notice") {
    switch (data.notice_type) {
      case "group_recall":
        session.type = "message-deleted";
        session.subtype = "group";
        session.subsubtype = "group";
        break;
      case "friend_recall":
        session.type = "message-deleted";
        session.subtype = "private";
        session.channelId = `private:${session.userId}`;
        session.subsubtype = "private";
        break;
      case "guild_channel_recall":
        session.type = "message-deleted";
        session.subtype = "guild";
        session.subsubtype = "guild";
        break;
      case "friend_add":
        session.type = "friend-added";
        break;
      case "group_upload":
        session.type = "guild-file-added";
        break;
      case "group_admin":
        session.type = "guild-member";
        session.subtype = "role";
        break;
      case "group_ban":
        session.type = "guild-member";
        session.subtype = "ban";
        break;
      case "group_decrease":
        session.type = session.userId === session.selfId ? "guild-deleted" : "guild-member-deleted";
        session.subtype = session.userId === session.operatorId ? "active" : "passive";
        break;
      case "group_increase":
        session.type = session.userId === session.selfId ? "guild-added" : "guild-member-added";
        session.subtype = session.userId === session.operatorId ? "active" : "passive";
        break;
      case "group_card":
        session.type = "guild-member";
        session.subtype = "nickname";
        break;
      case "notify":
        session.type = "notice";
        session.subtype = (import_satori2.hyphenate)(data.sub_type);
        if (session.subtype === "poke") {
          session.channelId || (session.channelId = `private:${session.userId}`);
        } else if (session.subtype === "honor") {
          session.subsubtype = (import_satori2.hyphenate)(data.honor_type);
        }
        break;
      case "message_reactions_updated":
        session.type = "onebot";
        session.subtype = "message-reactions-updated";
        break;
      case "channel_created":
        session.type = "onebot";
        session.subtype = "channel-created";
        break;
      case "channel_updated":
        session.type = "onebot";
        session.subtype = "channel-updated";
        break;
      case "channel_destroyed":
        session.type = "onebot";
        session.subtype = "channel-destroyed";
        break;
      default:
        return;
    }
  } else
    return;
  return session;
}


async function adaptMessage(bot: Bot, message: any, result: Partial<Session> = {}): Promise<Partial<Session>> {
  //result.author = adaptAuthor(message.sender, message.anonymous); 找不到这个函数
  result.author = message.sender;
  result.userId = result.author.userId;
  result.messageId = message.message_id.toString();
  result.timestamp = message.time * 1e3;
  if (message.guild_id) {
    result.guildId = message.guild_id;
    result.channelId = message.channel_id;
  } else if (message.group_id) {
    result.guildId = result.channelId = message.group_id.toString();
  } else {
    result.channelId = "private:" + result.author.userId;
  }
  const chain = CQCode.parse(message.message);
  const transformed = import_satori2.segment.transform(chain, {
    at({ qq }) {
      if (qq !== "all")
        return import_satori2.segment.at(qq);
      return (import_satori2.segment)("at", { type: "all" });
    },
    face({ id }) {
      return (import_satori2.segment)("face", { id, platform: bot.platform }, [
        import_satori2.segment.image(qface.getUrl(id))
      ]);
    },
    record(attrs) {
      return (import_satori2.segment)("audio", attrs);
    }
  });

  let items;
  if (Array.isArray(transformed)) {
    items = transformed.filter((item) => item !== undefined && item !== null);
  } else if (transformed !== undefined && transformed !== null) {
    items = [transformed];
  } else {
    items = [];
  }

  result.elements = items.map((item: string) => ({
    type: "element",
    content: item
  }));

  if (result.elements[0]?.type === "reply") {
    const reply = result.elements.shift();
    result.quote = await bot.getMessage(result.channelId, reply.attrs.id).catch((error) => {
      console.log(error);
      return void 0;
    });
  }
  result.content = result.elements.join("");
  return result;
}

interface CQCodeData {
  [key: string]: string;
}

interface CQCodeSegment {
  type: string;
  data: CQCodeData;
}

class CQCode {
  static escape(source: string, inline = false): string {
    const result = String(source).replace(/&/g, "&amp;").replace(/\[/g, "&#91;").replace(/\]/g, "&#93;");
    return inline ? result.replace(/,/g, "&#44;").replace(/(\ud83c[\udf00-\udfff])|(\ud83d[\udc00-\ude4f\ude80-\udeff])|[\u2600-\u2B55]/g, " ") : result;
  }

  static unescape(source: string): string {
    return String(source).replace(/&#91;/g, "[").replace(/&#93;/g, "]").replace(/&#44;/g, ",").replace(/&amp;/g, "&");
  }

  static from(source: string): CQCodeSegment | null {
    const pattern = /\[CQ:(\w+)((,\w+=[^,\]]*)*)\]/;
    const capture = pattern.exec(source);
    if (!capture)
      return null;
    const [, type, attrs] = capture;
    const data: CQCodeData = {};
    attrs && attrs.slice(1).split(",").forEach((str) => {
      const index = str.indexOf("=");
      data[str.slice(0, index)] = CQCode.unescape(str.slice(index + 1));
    });
    return { type, data };
  }

  static parse(source: string | CQCodeSegment[]): any {
    if (Array.isArray(source)) {
      return source.map(({ type, data }) => {
        if (type === "text") {
          return import_satori7.segment("text", { content: data.text });
        } else {
          return import_satori7.segment(type, data);
        }
      });
    } else {
      const elements = [];
      let result;
      while (result = CQCode.from(source)) {
        const { type, data } = result;
        if (result.index) {
          elements.push(import_satori7.segment("text", { content: CQCode.unescape(source.slice(0, result.index)) }));
        }
        elements.push(import_satori7.segment(type, data));
        source = source.slice(result.index + result[0].length);
      }
      if (source)
        elements.push(import_satori7.segment("text", { content: CQCode.unescape(source) }));
      return elements;
    }
  }
}

interface adaptDataSenderType {
  user_id: string;
  nickname: string;
  sex: string;
  age: number,
  card: string;
  level: string;
  role: string;
}
interface adaptDataType {
  user_id?: number;
  group_id?: number;
  channel_id?: number;
  font?: number;
  message_seq?: number;
  anonymous?: null;
  guild_id?: number;
  operator_id?: number;
  request_type?: string;
  comment?: string;
  flag?: string;
  notice_type?: string;
  post_type: string;// session的类型
  time: number;// 会话时间戳的秒数
  self_id: number;// 触发事件的机器人所在平台的编号
  message_type?: string;
  sub_type?: string;
  target_id?: number;// 未知作用
  message?: string;
  message_id?: number;// 事件相关的消息编号 (例如在回复消息时需要用到)。
  raw_message?: string;
  sender?: adaptDataSenderType;
}
function adaptData(session: Session): adaptDataType {
  const data: adaptDataType = {
    post_type: session.type,
    time: Math.floor(session.timestamp / 1000),
    self_id: parseInt(session.selfId),
  };

  // 私聊时的处理。 message 接受消息的通用类型；message_sent 未知
  if (session.type === "message" || session.type === "message_sent") {
    data.message_type = session.subsubtype;
    data.sub_type = session.subtype;

    if (session.type === "message_sent" && session.channelId?.startsWith("private:")) {
      data.target_id = parseInt(session.channelId.substr(8));
    }

    data.message = session.content;
    data.raw_message = session.content;

    if (session.author) {
      data.sender = {
        user_id: session.author.userId,
        nickname: session.author.nickname,
        sex: 'unknown',
        age: 0,
        card: session.author.username,
        level: '',
        role: session.author.roles[0]
      };
    }

    if (session.messageId) {
      data.message_id = parseInt(session.messageId);
    }
    // if (session.font) {
    //   data.font = session.font;
    // }
    if (session.channelId && session.channelId.startsWith("private:")) {
      data.message_type = "private";
      data.user_id = parseInt(session.channelId.substr(8));
    } else if (session.guildId && session.channelId) {
      data.message_type = "group";
      data.group_id = parseInt(session.guildId);
      data.channel_id = parseInt(session.channelId);
    }

    // 添加缺少的字段
    data.font = 0;
    data.message_seq = 0;
    data.anonymous = null;
    data.user_id = parseInt(session.author.userId);
    return data;
  }

  // 群/频道时的处理。
  groupMessageHandle(data, session);// 这里过后 data 会被修改

  // 其它请求处理
  if (session.type === "friend-request") {
    data.request_type = "friend";
    data.comment = session.content;
    data.flag = session.messageId;
  } else if (session.type === "guild-member-request") {
    data.sub_type = "add";
  } else if (session.type === "guild-request") {
    data.request_type = "group";
    data.comment = session.content;
    data.flag = session.messageId;
  } else if (session.type === "message-deleted") {
    switch (session.subsubtype) {
      case "group":
        data.notice_type = "group_recall";
        break;
      case "private":
        data.notice_type = "friend_recall";
        break;
      case "guild":
        data.notice_type = "guild_channel_recall";
        break;
    }
  } else if (session.type === "friend-added") {
    data.notice_type = "friend_add";
  } else if (session.type === "guild-file-added") {
    data.notice_type = "group_upload";
  } else if (session.type === "guild-member") {
    switch (session.subtype) {
      case "role":
        data.notice_type = "group_admin";
        break;
      case "ban":
        data.notice_type = "group_ban";
        break;
      case "nickname":
        data.notice_type = "group_card";
        break;
    }

    if (session.subsubtype === "deleted") {
      data.sub_type = "leave";
    }
  }
  return data;
}