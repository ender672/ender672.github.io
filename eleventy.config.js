import markdownIt from "markdown-it";

export default function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("assets/images");

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
