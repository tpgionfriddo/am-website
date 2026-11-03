import settings from "./content/settings.json";

export const site = { ...settings, url: import.meta.env.SITE_URL || settings.url };
