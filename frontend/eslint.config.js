import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
export default tseslint.config({ignores:['dist','node_modules','test-results','playwright-report']},...tseslint.configs.recommended,{files:['**/*.{ts,tsx}'],languageOptions:{globals:{...globals.browser,...globals.node}},plugins:{'react-hooks':hooks},rules:{'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'warn','@typescript-eslint/no-explicit-any':'error'}});
