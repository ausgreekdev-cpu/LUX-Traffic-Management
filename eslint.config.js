{
  "root": true,
  "env": {
    "browser": true,
    "es2022": true,
    "node": true
  },
  "extends": [
    "eslint:recommended"
  ],
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "rules": {
    "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
    "no-console": "warn",
    "eqeqeq": "error",
    "no-var": "error",
    "prefer-const": "error",
    "prefer-template": "warn"
  },
  "overrides": [
    {
      "files": ["backend/**/*.js"],
      "env": {
        "node": true,
        "browser": false
      },
      "rules": {
        "no-console": "off"
      }
    },
    {
      "files": ["frontend/**/*.js"],
      "env": {
        "browser": true,
        "node": false
      }
    },
    {
      "files": ["**/*.test.js", "**/*.spec.js"],
      "env": {
        "vitest-globals/env": true
      }
    }
  ]
}
