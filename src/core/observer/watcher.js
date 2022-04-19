/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop,
} from "../util/index";

import { traverse } from "./traverse";
import { queueWatcher } from "./scheduler";
import Dep, { pushTarget, popTarget } from "./dep";

import type { SimpleSet } from "../util/index";

let uid = 0;

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
// Watcher 负责订阅 Dep ，并在订阅的时候让 Dep 进行收集，接收到 Dep 发布的消息时，做好其 update 操作即可。
/**
 * 一个组件一个 watcher（渲染 watcher）或者一个表达式一个 watcher（用户watcher）
 * 当数据更新时 watcher 会被触发，访问 this.computedProperty 时也会触发 watcher
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor(
    // 被观察的vue实例
    vm: Component,
    expOrFn: string | Function, // 获取到用户传递的函数或者字符串
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    // 保留对vue实例的引用
    this.vm = vm;
    // 如果是render watcher
    if (isRenderWatcher) {
      vm._watcher = this;
    }
    // 将当前wather实例添加到vue实例的_watcher数组中
    vm._watchers.push(this);
    // options
    if (options) {
      this.deep = !!options.deep; // 深度监听
      this.user = !!options.user; // 如果是watch
      this.lazy = !!options.lazy; // 如果是一个计算watcher就会传递过来
      /*
      在我们之前对 setter 的分析过程知道，当响应式数据发送变化后，
      触发了 watcher.update()，只是把这个 watcher 推送到一个队列中，
      在 nextTick 后才会真正执行 watcher 的回调函数。而一旦我们设置了 sync，
      就可以在当前 Tick 中同步执行 watcher 的回调函数。
      */
      this.sync = !!options.sync;
      this.before = options.before; // 如果是渲染watcher会传递过来
    } else {
      // 默认为 false
      this.deep = this.user = this.lazy = this.sync = false;
    }
    /*
    考虑到 Vue 是数据驱动的，所以每次数据变化都会重新 render，
    那么 vm._render() 方法又会再次执行，并再次触发数据的 getters，
    所以 Watcher 在构造函数中会初始化 2 个 Dep 实例数组，
    newDeps 表示新添加的 Dep 实例数组，
    而 deps 表示上一次添加的 Dep 实例数组。
    */
    this.cb = cb;
    this.id = ++uid; // uid for batching
    this.active = true;
    /*
    computed 新建 watcher 的时候，传入 lazy

    没错，作用是把计算结果缓存起来，而不是每次使用都要重新计算
    而这里呢，还把 lazy 赋值给了 dirty，为什么呢？

    因为  lazy 表示一种固定描述，不可改变，表示这个 watcher 需要缓存

    而 dirty 表示缓存是否可用，如果为 true，表示缓存脏了，需要重新计算，否则不用

    dirty 默认是 false 的，而 lazy 赋值给 dirty，就是给一个初始值，表示 你控制缓存的任务开始了

    所以记住，【dirty】 是真正的控制缓存的关键，而 lazy 只是起到一个开启的作用
    */
    this.dirty = this.lazy; // for lazy watchers
    this.deps = [];
    this.newDeps = [];
    this.depIds = new Set();
    this.newDepIds = new Set();
    this.expression =
      process.env.NODE_ENV !== "production" ? expOrFn.toString() : "";
    // parse expression for getter
    // 将expression转换为一个getter函数，用以得到最新值
    // 判断传递的expOrFn是否是函数
    if (typeof expOrFn === "function") {
      // 赋值给getter
      this.getter = expOrFn;
    } else {
      // this.getter = function() { return this.xx }
      // 在 this.get 中执行 this.getter 时会触发依赖收集
      // 待后续 this.xx 更新时就会触发响应式
      // 而针对非函数的expOrFn会调用parsePath函数，实际上就是针对选项watch中生成watcher对象的处理
      this.getter = parsePath(expOrFn);
      if (!this.getter) {
        this.getter = noop;
        process.env.NODE_ENV !== "production" &&
          warn(
            `Failed watching path: "${expOrFn}" ` +
              "Watcher only accepts simple dot-delimited paths. " +
              "For full control, use a function instead.",
            vm
          );
      }
    }
    // 计算watcher的时候为true 不会立即进行计算 渲染watcher就会立即进行计算
    // 这里可以算是 Vue 的一个优化，只有你再读取 computed，再开始计算，而不是初始化就开始计算值了
    this.value = this.lazy ? undefined : this.get();
    // 调用函数进行更新
  }
  /**
   * 执行 this.getter，并重新收集依赖
   * this.getter 是实例化 watcher 时传递的第二个参数，一个函数或者字符串，比如：updateComponent 或者 parsePath 返回的读取 this.xx 属性值的函数
   * 为什么要重新收集依赖？
   *   因为触发更新说明有响应式数据被更新了，但是被更新的数据虽然已经经过 observe 观察了，但是却没有进行依赖收集，
   *   所以，在更新页面时，会重新执行一次 render 函数，执行期间会触发读取操作，这时候进行依赖收集
   */
  get() {
    // 依赖收集
    // 将当前watcher添加到全局的targetStack中，并作为当前watcher
    pushTarget(this); // Dep.target = watcher

    // value 为回调函数执行的结果
    let value;
    const vm = this.vm;
    try {
      // 根据getter计算value的值
      // this.getter对应的就是updateComponent函数这其实就是在执行 vm._update(vm._render(), hydrating)
      // 他会先执行vm._render()这个方法, 因为这个方法最后会生成渲染Vnode,并且在这个过程中会对vm上的数据进行访问,这个时候就触发了数据对象的getter
      // 那么每个对象值的 getter 都持有一个 dep，在触发 getter 的时候会调用 dep.depend() 方法，也就会执行 Dep.target.addDep(this)。
      value = this.getter.call(vm, vm); // 会取值  vm__update(vm._render()) 渲染watcher
      // 执行回调函数，比如 updateComponent，进入 patch 阶段
    } catch (e) {
      // 如果是用户自己创建的watch如果报错直接走这里
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`);
      } else {
        throw e;
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      // 这个是要递归去访问 value，触发它所有子项的 getter
      if (this.deep) {
        traverse(value);
      }
      // 实际上就是把 Dep.target 恢复成上一个状态，因为当前 vm 的数据依赖收集已经完成，那么对应的渲染Dep.target 也需要改变
      popTarget(); // Dep.target = null
      // 清理依赖
      this.cleanupDeps();
    }
    return value;
  }

  /**
   * Add a dependency to this directive.
   */
  /**
   * 1. 如果dep已经在watcher中，则不作任何处理
   * 2. 如果是新增的依赖，那么将dep添加到watcher的依赖数组里
   * 3. 将watcher加到dep的订阅者数组里
   */
  /*
  这时候会做一些逻辑判断（保证同一数据不会被添加多次）后执行 dep.addSub(this)，
  那么就会执行 this.subs.push(sub)，也就是说把当前的 watcher 订阅到这个数据持有的 dep 的 subs 中，
  这个目的是为后续数据变化时候能通知到哪些 subs 做准备
  */
  //  订阅Dep, 让Dep也知道自己订阅他
  addDep(dep: Dep) {
    // 判重，如果 dep 已经存在则不重复添加
    const id = dep.id;
    if (!this.newDepIds.has(id)) {
      // 缓存 dep.id，用于判重
      this.newDepIds.add(id);
      // 添加 dep
      this.newDeps.push(dep);
      // 避免在 dep 中重复添加 watcher，this.depIds 的设置在 cleanupDeps 方法中
      if (!this.depIds.has(id)) {
        // 如果在depIds中没有被订阅的dep添加watcher到subs中
        dep.addSub(this);
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  /**
   * 清除依赖收集
   */
  cleanupDeps() {
    let i = this.deps.length;
    while (i--) {
      // 将watcher从dep的订阅者队列中删除
      const dep = this.deps[i];
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this);
      }
    }
    // 更新depIds
    let tmp = this.depIds;
    this.depIds = this.newDepIds;
    this.newDepIds = tmp;
    this.newDepIds.clear();

    // 更新deps
    tmp = this.deps;
    this.deps = this.newDeps;
    this.newDeps = tmp;
    this.newDeps.length = 0;
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  /**
   * 订阅接口，当依赖发生变化时调用
   * 根据 watcher 配置项，决定接下来怎么走，一般是 queueWatcher
   */
  update() {
    /* istanbul ignore else */
    if (this.lazy) {
      // 计算属性会走这里
      // 先说一个设定，computed数据A 引用了 data数据B，即A 依赖 B，所以B 会收集到 A 的 watcher
      // 当 B 改变的时候，会通知 A 进行更新，即调用 A-watcher.update
      // 当通知 computed 更新的时候，就只是 把 dirty 设置为 true，从而 读取 comptued 时，便会调用 evalute 重新计算
      // 懒执行时走这里，比如 computed
      // 将 dirty 置为 true，可以让 computedGetter 执行时重新计算 computed 回调函数的执行结果
      this.dirty = true;
    } else if (this.sync) {
      // 同步执行，在使用 vm.$watch 或者 watch 选项时可以传一个 sync 选项，
      // 当为 true 时在数据更新时该 watcher 就不走异步更新队列，直接执行 this.run
      // 方法进行更新
      // 这个属性在官方文档中没有出现
      // 立刻执行run进行执行
      this.run();
    } else {
      // 开启异步队列，批量更新watcher
      queueWatcher(this);
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  /**
   * 任务调度接口，scheduler中调用
   */

  /**
   * 由 刷新队列函数 flushSchedulerQueue 调用，完成如下几件事：
   *   1、执行实例化 watcher 传递的第二个参数，updateComponent 或者 获取 this.xx 的一个函数(parsePath 返回的函数)
   *   2、更新旧值为新值
   *   3、执行实例化 watcher 时传递的第三个参数，比如用户 watcher 的回调函数
   */
  run() {
    if (this.active) {
      // 重写执行watcher.get方法
      const value = this.get();
      // 渲染watcher不会执行下面的 js 如果是用户watcher调用this.cb()
      // 如果满足新旧值不等、新值是对象类型、deep 模式任何一个条件，则执行 watcher 的回调，注意回调函数执行的时候会把第一个和第二个参数传入新值 value 和旧值 oldValue，这就是当我们添加自定义 watcher 的时候能在回调函数的参数中拿到新旧值的原因。
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        // 更新旧值为新值
        const oldValue = this.value;
        this.value = value;
        if (this.user) {
          // 如果是用户 watcher，则执行用户传递的第三个参数 —— 回调函数，参数为 val 和 oldVal
          try {
            this.cb.call(this.vm, value, oldValue);
          } catch (e) {
            handleError(
              e,
              this.vm,
              `callback for watcher "${this.expression}"`
            );
          }
        } else {
          this.cb.call(this.vm, value, oldValue);
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  /**
   * 计算watcher的值，只有lazy watcher（computed属性对应的watcher）会调用
   * 判断 this.dirty，如果为 true 则通过 this.get() 求值，
   * 然后把 this.dirty 设置为 false。在求值过程中，
   * 会执行 value = this.getter.call(vm, vm)，
   * 这实际上就是执行了计算属性定义的 getter 函数
   * 这里需要特别注意的是，由于 this.firstName 和 this.lastName
   * 都是响应式对象，这里会触发它们的 getter，
   * 根据我们之前的分析，
   * 它们会把自身持有的 dep 添加到当前正在计算的 watcher 中，
   * 这个时候 Dep.target 就是这个 computed watcher。
   */
  /**
   * 懒执行的 watcher 会调用该方法
   *   比如：computed，在获取 vm.computedProperty 的值时会调用该方法
   * 然后执行 this.get，即 watcher 的回调函数，得到返回值
   * this.dirty 被置为 false，作用是页面在本次渲染中只会一次 computed.key 的回调函数，
   *   这也是大家常说的 computed 和 methods 区别之一是 computed 有缓存的原理所在
   * 而页面更新后会 this.dirty 会被重新置为 true，这一步是在 this.update 方法中完成的
   */
  evaluate() {
    this.value = this.get();
    // 执行完更新函数之后，重置为false
    this.dirty = false;
  }

  /**
   * Depend on all deps collected by this watcher.
   */

  /**
   * 一次性订阅此watcher收集的依赖。
   * 计算属性专有的函数，当计算属性依赖了响应式对象的时候会递归响应式变量 给响应式变量的dep这添加渲染wathcer，最终dep中有两个变量：一个是计算属性wathcer 一个是渲染watcher
   * 修改计算属性依赖的变量的时候 计算属性wathcer是比渲染wathcer先加入到dep中的 所以计算属性wathcer执行update方法的时候会把dirty设置为true
   * 同时前面说到在 computed watcher 求值结束后，会将 dirty 置为 false，之后再获取计算属性的值时都会跳过 evaluate 方法直接返回以前的 value，而执行 computed watcher 的 update 方法会将 dirty 再次变成 true，整个computed watcher 只做这一件事，即取消 computed watcher 使用以前的缓存的标志
   * 这个操作是同步执行的，也就是说即使 render watcher 或 user watcher 在 watchers 数组中比 computed watcher 靠前，但是由于前2个 watcher 一般是异步执行的，所以最终执行的时候 computed watcher 会优先执行
   * 而真正的求值操作是在 render watcher 中进行的，当遍历到渲染wathcer时，由于视图依赖了响应式数据，会触发计算属性的getter，再次执行到之前的computedGetter，由于上一步将dirty变为true了，所以会再次进入wvalutate重新计算，此时就能拿到最新的值了
   */
  depend() {
    let i = this.deps.length;
    while (i--) {
      this.deps[i].depend();
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  /**
   * 将watcher从所有依赖的订阅者列表中删除
   */
  teardown() {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this);
      }
      let i = this.deps.length;
      while (i--) {
        this.deps[i].removeSub(this);
      }
      this.active = false;
    }
  }
}
