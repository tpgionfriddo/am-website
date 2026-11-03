import type { ImageMetadata } from "astro";

export interface ContentImage {
	src?: string | null;
	alt?: string;
	width?: number | null;
	height?: number | null;
}

const images = import.meta.glob<{ default: ImageMetadata }>("/src/assets/media/**/*.{jpg,jpeg,png,gif,webp,avif,svg}", { eager: true });

export function imageMetadata(image: ContentImage | string | null | undefined): ImageMetadata | null {
	const path = typeof image === "string" ? image : image?.src;
	if (!path) return null;
	const result = images[path]?.default;
	if (!result) throw new Error(`Missing local image: ${path}`);
	return result;
}
