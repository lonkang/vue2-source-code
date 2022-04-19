/* @flow */

import type Watcher from "./watcher";
import { remove } from "../util/index";
import config from "../config";

let uid = 0;

/*
  Dep 负责收集所有相关的的订阅者 Watcher ，具体谁不用管，具体有多少也不用管，只需要根据 target 指向的计算去收集订阅其消息的 Watcher 即可，然后做好消息发布 notify 即可。
  Watcher 负责订阅 Dep ，并在订阅的时候让 Dep 进行收集，接收到 Dep 发布的消息时，做好其 update 操作即可。
*/
/*
我们在劫持到数据变更的时候，并进行数据变更通知的时候，如果不做一个”中转站”的话，我们根本不知道到底谁订阅了消息，具体有多少对象订阅了消息。
发布者A与订阅者B进行信息传递，两人都知道对方这么一个人的存在，但A不知道具体B是谁以及到底有多少订阅者订阅着自己，可能很多订阅者都订阅着A的信息， 发布者A 需要通过暗号 收集到所有订阅着其消息的订阅者，这里对于订阅者的收集其实就是一层封装。然后A只需将消息发布出去，而订阅者们接受到通知，只管进行自己的 update 操作即可。
Dep需要完成两个内容，1.定义subs数组，用来收集订阅者Watcher；2.当劫持到数据变更的时候，通知订阅者Watcher进行update操作，代码如下：
*/

/**
 * 一个 dep 对应一个 obj.key
 * 在读取响应式数据时，负责收集依赖，每个 dep（或者说 obj.key）依赖的 watcher 有哪些
 * 在响应式数据更新时，负责通知 dep 中那些 watcher 去执行 update 方法
 */
export default class Dep {
  // 当前watcher
  static target: ?Watcher;
  // 依赖的id
  id: number;
  // 订阅该依赖的wathcer
  subs: Array<Watcher>;

  constructor() {
    // 用来给每个订阅者 Watcher 做唯一标识符，防止重复收集
    this.id = uid++;
    // 定义subs数组，用来做依赖收集(收集所有的订阅者 Watcher)
    this.subs = [];
  }
  /*
    添加订阅者，一个wathcer是一个订阅者
  */
  // 在dep.depend调用watcher进行添加当前dep
  // 然后再判断depIds中如果没有当前dep的话调用 addSub进行添加watcher形成闭环
  addSub(sub: Watcher) {
    this.subs.push(sub);
  }
  /*
    移除订阅者，一个watcher是一个订阅者
  */
  removeSub(sub: Watcher) {
    remove(this.subs, sub);
  }
  /*
    将dep实例添加为当前watcher的依赖
  */
  // 在observer/index.js中的defineReactive进行数据劫持的时候在get中调用
  // 计算属性中会调用 watcher 触发get然后触发到响应式数据进行添加依赖
  depend() {
    if (Dep.target) {
      // 搜集依赖，最终会调用上面的 addSub 方法
      Dep.target.addDep(this);
    }
  }
  /*
    通知所有被订阅者更新
  */
  notify() {
    // stabilize the subscriber list first
    const subs = this.subs.slice(); // 获取到所有订阅的watcher
    if (process.env.NODE_ENV !== "production" && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id);
    }
    // 遍历 dep 中存储的 watcher，执行 watcher.update()
    for (let i = 0, l = subs.length; i < l; i++) {
      // 调用订阅wathcer进行更新视图
      subs[i].update();
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
/**
 * 当前正在执行的 watcher，同一时间只会有一个 watcher 在执行
 * Dep.target = 当前正在执行的 watcher
 * 通过调用 pushTarget 方法完成赋值，调用 popTarget 方法完成重置（null)
 */
Dep.target = null;
const targetStack = [];

// 在需要进行依赖收集的时候调用，设置 Dep.target = watcher
export function pushTarget(target: ?Watcher) {
  targetStack.push(target);
  Dep.target = target;
}
// 实际上就是把 Dep.target 恢复成上一个状态，因为当前 vm 的数据依赖收集已经完成，那么对应的渲染Dep.target 也需要改变
// 依赖收集结束调用，设置 Dep.target = null
export function popTarget() {
  targetStack.pop();
  Dep.target = targetStack[targetStack.length - 1];
}
