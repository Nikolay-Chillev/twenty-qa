// Allure 3 report settings, used by `npm run report` and in CI.
export default {
  name: 'twenty-qa',
  output: './allure-report',
  // CI restores this file from the published report before generating, so trends and
  // flaky-test detection span runs.
  historyPath: './allure-history/history.jsonl',
  plugins: {
    awesome: {
      options: {
        reportLanguage: 'en',
      },
    },
  },
};
