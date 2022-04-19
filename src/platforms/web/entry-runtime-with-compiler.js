/* @flow */

import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'

import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

const mount = Vue.prototype.$mount
// 传入的 template 选项，或者 html 文本，通过一系列的编译生成 render 函数。
// 编译这个 template，生成 ast 抽象语法树。
// 优化这个 ast，标记静态节点。（渲染过程中不会变的那些节点，优化性能）。
// 根据 ast，生成 render 函数。
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 拿到el所对应的dom对象
  el = el && query(el)
  // 它对 el 做了限制，Vue 不能挂载在 body、html 这样的根节点上。
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }
  // 获取传入的options
  const options = this.$options
  // 判断这个options中是否有自己写的render函数 有的话就直接挂载 没有就通过compileToFunctions函数进行生成
  if (!options.render) {
    // 没有就获取用户写的template
    let template = options.template
    // 判断是否有template
    if (template) {
      // 判断template是dom还是字符串并且做出相对应的处理
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        // 如果template是dom就直接获取innerHtml
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
      // 如果不存在的话就直接获取el所对应的对象及其内容的HTML形式
      template = getOuterHTML(el)
    }
    if (template) {
      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }
      // 编译模版，得到 动态渲染函数和静态渲染函数
      const { render, staticRenderFns } = compileToFunctions(template, {
        // 在非生产环境下，编译时记录标签属性在模版字符串中开始和结束的位置索引
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        // 界定符，默认 {{}}
        delimiters: options.delimiters,
        // 是否保留注释
        comments: options.comments
      }, this)
      // 将两个渲染函数放到 this.$options 上
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  // 在 Vue 2.0 版本中，所有 Vue 的组件的渲染最终都需要 render 方法，无论我们是用单文件 .vue 方式开发组件，
  // 还是写了 el 或者 template 属性，最终都会转换成 render 方法，那么这个过程是 Vue 的一个“在线编译”的过程
  return mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
function getOuterHTML (el: Element): string {
  // 如果有的话就获取
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    // 如果没有的话就直接在他的外面包一层
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue
