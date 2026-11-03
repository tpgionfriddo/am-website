/**
 * Fixed site details used by the header menu, footer and structured data.
 * (Page content -- including the Contact page details -- is edited in the CMS.)
 */
export const site = {
	name: "Architecture Matters",
	legalName: "Architecture Matters Pty Ltd",
	url: "https://architecturematters.com.au",
	phone: "(03) 9329 7063",
	phoneHref: "tel:+61393297063",
	email: "info@architecturematters.com.au",
	address: ["Level 1/430 William Street,", "West Melbourne VIC 3003"],
	poBox: "PO Box 285 North Melbourne VIC 3051",
	acknowledgement:
		"We acknowledge the Traditional Owners and Custodians of the land on which we operate, the Wurundjeri people of the Kulin Nation, and pay our respects to their Elders past, present and emerging. We recognise their ongoing connection to this land, waterways and community, and commit to working together towards a more just and equitable future.",
	social: [
		{ name: "facebook", url: "https://www.facebook.com/people/Architecture-Matters-Pty-Ltd/100039303281766/" },
		{ name: "instagram", url: "https://www.instagram.com/architecture_matters/" },
		{ name: "linkedin", url: "https://au.linkedin.com/company/architecture-matters-pty-ltd" },
		{ name: "houzz", url: "https://www.houzz.com.au/professionals/architects/architecture-matters-pty-ltd-pfvwau-pf~1258685298" },
		{ name: "youtube", url: "https://www.youtube.com/channel/UC2ztks8OyVN8KuIa_K3l3hQ" },
	],
} as const;
