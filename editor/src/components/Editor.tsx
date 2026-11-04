import type { Config } from "@keystatic/core";
import { Keystatic } from "@keystatic/core/ui";
import localConfig from "../../../keystatic.config";

const cloudConfig: Config = {
	...localConfig,
	ui: { brand: localConfig.ui?.brand },
	storage: { kind: "cloud" },
	cloud: { project: import.meta.env.PUBLIC_KEYSTATIC_CLOUD_PROJECT },
};

export default function Editor() {
	return <Keystatic config={cloudConfig} />;
}
