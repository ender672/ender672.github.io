module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("assets/images");

  return {
    dir: {
      input: ".",
      output: "_site",
    },
  };
};
