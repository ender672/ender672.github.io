import markdownIt from "markdown-it";
import {
  getNewestCollectionItemDate,
  dateToRfc3339,
} from "@11ty/eleventy-plugin-rss";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";

export default function(eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);
  eleventyConfig.addPassthroughCopy("assets/images");
  eleventyConfig.addPassthroughCopy("assets/favicon.svg");
  eleventyConfig.addPassthroughCopy("robots.txt");

  eleventyConfig.addFilter("getNewestCollectionItemDate", getNewestCollectionItemDate);
  eleventyConfig.addFilter("dateToRfc3339", dateToRfc3339);

  const md = markdownIt({ html: true });
  const defaultRender = md.render.bind(md);
  md.render = function(src, env) {
    return `<article class="markdown"><div class="content-wrap">${defaultRender(src, env)}</div></article>`;
  };
  eleventyConfig.setLibrary("md", md);

  return {
    dir: {
      input: ".",
      output: "_site",
    },
  };
};
