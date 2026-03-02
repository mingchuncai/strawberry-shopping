// .eslintrc.js
export default {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true
  },
  extends: [
    'plugin:vue/vue3-essential',
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'vue/multi-word-component-names': 'off', // 或 0 都可以
    'no-undef': 'off' // 临时关闭这个，避免 module 未定义报错
  }
}
