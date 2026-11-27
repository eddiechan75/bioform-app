import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const [repositoryOwner = "", repositoryName] = (
  process.env.GITHUB_REPOSITORY ?? ""
).split("/");
const isUserOrOrganizationSite =
  repositoryName?.toLowerCase() === `${repositoryOwner.toLowerCase()}.github.io`;
const base =
  process.env.GITHUB_ACTIONS === "true" &&
  repositoryName &&
  !isUserOrOrganizationSite
    ? `/${repositoryName}/`
    : "/";

export default defineConfig({
  base,
  plugins: [vue()],
});
