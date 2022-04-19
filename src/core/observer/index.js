/* @flow */

import Dep from "./dep";
import VNode from "../vdom/vnode";
import { arrayMethods } from "./array";
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering,
} from "../util/index";

const arrayKeys = Object.getOwnPropertyNames(arrayMethods);

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true;

export function toggleObserving(value: boolean) {
  shouldObserve = value;
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
/*
首先实例化 Dep 对象
接着通过执行 def 函数把自身实例添加到数据对象 value 的 __ob__ 属性上
Observer 是一个类，它的作用是给对象的属性添加 getter 和 setter，用于依赖收集和派发更新：
*/
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor(value: any) {
    this.value = value;
    // 实例化一个 dep
    this.dep = new Dep();
    this.vmCount = 0;
    // src/core/util/lang.js
    // 通过执行def函数把自身实例添加到数据对象value的__ob__属性上
    def(value, "__ob__", this);
    /*
    protoAugment 方法是直接把 target.__proto__ 原型直接修改为 src，
    而 copyAugment 方法是遍历 keys，通过 def，
    也就是 Object.defineProperty 去定义它自身的属性值。
    对于大部分现代浏览器都会走到 protoAugment，
    那么它实际上就把 value 的原型指向了 arrayMethods
    */
    if (Array.isArray(value)) {
      // 如果浏览器支持 __proto__的话执行protoAugment函数进行改写数组的方法
      if (hasProto) {
        protoAugment(value, arrayMethods);
      } else {
        copyAugment(value, arrayMethods, arrayKeys);
      }
      this.observeArray(value);
    } else {
      this.walk(value);
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk(obj: Object) {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i]);
    }
  }

  /**
   * Observe a list of Array items.
   * 对数组项进行观察
   */
  observeArray(items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i]);
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment(target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src;
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i];
    def(target, key, src[key]);
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe(value: any, asRootData: ?boolean): Observer | void {
  // 给非VNode的对象类型数据添加一个observer，否则在满足一定条件下去实例化一个 Observer 对象实例
  if (!isObject(value) || value instanceof VNode) {
    return;
  }
  let ob: Observer | void;
  // 如果添加过后则直接返回
  if (hasOwn(value, "__ob__") && value.__ob__ instanceof Observer) {
    ob = value.__ob__;
  } else if (
    // 满足一定条件下去实例化一个 Observer 对象实例
    shouldObserve &&
    !isServerRendering() && // 不是服务端环境下
    (Array.isArray(value) || isPlainObject(value)) && // 是对象或者数据
    Object.isExtensible(value) && // 是一个可扩展的属性
    !value._isVue
  ) {
    ob = new Observer(value);
  }
  if (asRootData && ob) {
    ob.vmCount++;
  }
  return ob;
}

/**
 * Define a reactive property on an Object.
 */
// defineReactive 的功能就是定义一个响应式对象，给对象动态添加 getter 和 setter
// 数据劫持
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // vue中dep和watcher的观察者模式示例，watcher订阅dep，dep通知watcher执行update。
  // 这里用到了观察者（发布/订阅）模式进行了劫持封装，它定义了一种一对多的关系，让多个观察者监听一个主题对象，这个主题对象的状态发生改变时会通知所有观察者对象，观察者对象就可以更新自己的状态。
  const dep = new Dep(); // 实例化一个 Dep 的实例

  // 获取 obj[key] 的属性描述符，发现它是不可配置对象的话直接 return
  const property = Object.getOwnPropertyDescriptor(obj, key);
  if (property && property.configurable === false) {
    return;
  }

  // 记录 getter 和 setter，获取 val 值
  const getter = property && property.get;
  const setter = property && property.set;
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }
  // 递归调用，处理 val 即 obj[key] 的值为对象的情况，保证对象中的所有 key 都被观察
  let childOb = !shallow && observe(val);
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // get 拦截对 obj[key] 的读取操作
    get: function reactiveGetter() {
      const value = getter ? getter.call(obj) : val;
      // 通过依赖的watcher 添加相对应的订阅者
      /**
       * Dep.target 为 Dep 类的一个静态属性，值为 watcher，在实例化 Watcher 时会被设置
       * 实例化 Watcher 时会执行 new Watcher 时传递的回调函数（computed 除外，因为它懒执行）
       * 而回调函数中如果有 vm.key 的读取行为，则会触发这里的 读取 拦截，进行依赖收集
       * 回调函数执行完以后又会将 Dep.target 设置为 null，避免这里重复收集依赖
       */
      if (Dep.target) {
        // 依赖收集，在 dep 中添加 watcher，也在 watcher 中添加 dep
        dep.depend();
        // childOb 表示对象中嵌套对象的观察者对象，如果存在也对其进行依赖收集
        if (childOb) {
          /*子对象进行依赖收集，其实就是将同一个watcher观察者实例放进了两个depend中，一个是正在本身闭包中的depend，另一个是子元素的depend
          在 getter 过程中判断了 childOb，并调用了 childOb.dep.depend() 收集了依赖，这就是为什么执行 Vue.set 的时候通过 ob.dep.notify() 能够通知到 watcher，从而让添加新的属性到对象也可以检测到变化。这里如果 value 是个数组，那么就通过 dependArray 把数组每个元素也去做依赖收集
          */
          childOb.dep.depend();
          // 如果是 obj[key] 是 数组，则触发数组响应式
          if (Array.isArray(value)) {
            /*是数组则需要对每一个成员都进行依赖收集，如果数组的成员还是数组，则递归。*/
            dependArray(value);
          }
        }
      }
      return value;
    },
    // set 拦截对 obj[key] 的设置操作
    // 劫持到数据变更，并发布消息进行通知
    set: function reactiveSetter(newVal) {
      // 旧的 obj[key]
      const value = getter ? getter.call(obj) : val;
      // 如果新老值一样，则直接 return，不跟新更不触发响应式更新过程
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return;
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== "production" && customSetter) {
        customSetter();
      }
      // setter 不存在说明该属性是一个只读属性，直接 return
      // #7981: for accessor properties without setter
      if (getter && !setter) return;
      // 设置新值
      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }
      // 对新值进行观察，让新值也是响应式的
      childOb = !shallow && observe(newVal);
      dep.notify(); // 依赖通知更新
    },
  });
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set(target: Array<any> | Object, key: any, val: any): any {
  if (
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(
      `Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`
    );
  }
  // 首先判断如果 target 是数组且 key 是一个合法的下标，则之前通过 splice 去添加进数组然后返回
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key);
    target.splice(key, 1, val);
    return val;
  }
  // 又判断 key 已经存在于 target 中，则直接赋值返回
  if (key in target && !(key in Object.prototype)) {
    target[key] = val;
    return val;
  }
  /* 再获取到 target.__ob__ 并赋值给 ob，之前分析过它是在 Observer 的构造函数执行的时候初始化的，
  表示 Observer 的一个实例，*/
  const ob = (target: any).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid adding reactive properties to a Vue instance or its root $data " +
          "at runtime - declare it upfront in the data option."
      );
    return val;
  }
  // 如果它不存在，则说明 target 不是一个响应式的对象，则直接赋值并返回
  if (!ob) {
    target[key] = val;
    return val;
  }
  /*
  最后通过 defineReactive(ob.value, key, val) 把新添加的属性变成响应式对象，然后再通过 ob.dep.notify() 手动的触发依赖通知
  */
  defineReactive(ob.value, key, val);
  /*
    在 getter 过程中判断了 childOb，并调用了 childOb.dep.depend() 收集了依赖，这就是为什么执行 Vue.set 的时候通过 ob.dep.notify() 能够通知到 watcher，从而让添加新的属性到对象也可以检测到变化。这里如果 value 是个数组，那么就通过 dependArray 把数组每个元素也去做依赖收集
  */
  ob.dep.notify();
  return val;
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del(target: Array<any> | Object, key: any) {
  if (
    process.env.NODE_ENV !== "production" &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(
      `Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`
    );
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1);
    return;
  }
  const ob = (target: any).__ob__;
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== "production" &&
      warn(
        "Avoid deleting properties on a Vue instance or its root $data " +
          "- just set it to null."
      );
    return;
  }
  if (!hasOwn(target, key)) {
    return;
  }
  delete target[key];
  if (!ob) {
    return;
  }
  ob.dep.notify();
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
/**
 * 遍历每个数组元素，递归处理数组项为对象的情况，为其添加依赖
 * 因为前面的递归阶段无法为数组中的对象元素添加依赖
 */
function dependArray(value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i];
    e && e.__ob__ && e.__ob__.dep.depend();
    if (Array.isArray(e)) {
      dependArray(e);
    }
  }
}
