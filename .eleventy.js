import { feedPlugin } from "@11ty/eleventy-plugin-rss";

export default function (eleventyConfig) {
  // YYYY-MM-DD for post dates in the terminal vibe.
  eleventyConfig.addFilter("htmlDateString", (date) => {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(0, 10);
  });

  // Generates /feed.xml (Atom) from the "blog" collection.
  eleventyConfig.addPlugin(feedPlugin, {
    type: "atom",
    outputPath: "/feed.xml",
    collection: {
      name: "blog",
      limit: 0,
    },
    metadata: {
      language: "en",
      title: "Ben Emdon",
      subtitle:
        "Ben Emdon. Making software development faster and safer at Stripe. Previously GitHub.",
      base: "https://benemdon.github.io/",
      author: {
        name: "Ben Emdon",
      },
    },
  });

  // The hand-built design lives here untouched: CSS, JS, and images are
  // copied through as-is, so the blog inherits the site's look for free.
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("favicon.svg");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy("og-card.html");

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
