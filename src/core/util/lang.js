/* @flow */

/**
 * unicode letters used for parsing html tags, component names and property paths.
 * using https://www.w3.org/TR/html53/semantics-scripting.html#potentialcustomelementname
 * skipping \u10000-\uEFFFF due to it freezing up PhantomJS
 */
export const unicodeRegExp = /a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/

/**
 * Check if a string starts with $ or _
 */
export function isReserved (str: string): boolean {
  const c = (str + '').charCodeAt(0)
  return c === 0x24 || c === 0x5F
}

/**
 * Define a property.
 */
// def 函数是一个非常简单的Object.defineProperty 的封装，这就是为什么我在开发中输出 data 上对象类型的数据，会发现该对象多了一个 __ob__ 的属性。
export function def (obj: Object, key: string, val: any, enumerable?: boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  })
}

/**
 * Parse simple path.
 */
const bailRE = new RegExp(`[^${unicodeRegExp.source}.$_\\d]`)
export function parsePath (path: string): any {
  if (bailRE.test(path)) {
    return
  }
  const segments = path.split('.')
  return function (obj) {
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      // 通过key值获取data中的数据
      obj = obj[segments[i]]
    }
    return obj
  }
}
