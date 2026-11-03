/**
 * Front-end behaviour of the original "rarchitecture" theme (assets/js/main.js),
 * ported from jQuery to plain DOM APIs.
 */
import Swiper from "swiper";
import { Autoplay, EffectFade, Navigation, Pagination } from "swiper/modules";

const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
	Array.from(root.querySelectorAll<T>(sel));

// ---- viewport height fix for iOS toolbars
const setVh = () => document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
setVh();
window.addEventListener("resize", setVh);

// ---- acknowledgement of country modal (shown once per browser session)
$$(".modal__button").forEach((btn) =>
	btn.addEventListener("click", () => {
		btn.closest(".modal")?.classList.add("close");
		try {
			sessionStorage.setItem("ack-dismissed", "1");
		} catch {}
	}),
);

// ---- overlay menu
$$(".menu-toggle").forEach((btn) =>
	btn.addEventListener("click", () => {
		const open = !btn.classList.contains("is-active");
		btn.classList.toggle("is-active", open);
		btn.setAttribute("aria-expanded", String(open));
		document.body.classList.toggle("is-menu-open", open);
		document.querySelector(".overlay-menu")?.classList.toggle("is-open", open);
	}),
);

// ---- slide helpers (jQuery slideUp/slideDown/fadeIn equivalents)
function slide(el: HTMLElement, open: boolean, ms = 200) {
	if (open) {
		el.style.display = "block";
		const h = el.scrollHeight;
		el.animate([{ height: "0px", overflow: "hidden" }, { height: `${h}px`, overflow: "hidden" }], { duration: ms });
	} else if (el.style.display !== "none" && getComputedStyle(el).display !== "none") {
		const h = el.scrollHeight;
		el.animate([{ height: `${h}px`, overflow: "hidden" }, { height: "0px", overflow: "hidden" }], { duration: ms }).onfinish = () =>
			(el.style.display = "none");
	}
}

// ---- accordion with linked images
$$(".accordion-section").forEach((section) => {
	const buttons = $$<HTMLButtonElement>(".accordion__button", section);
	const images = $$(".accordion__image", section);
	buttons.forEach((btn) =>
		btn.addEventListener("click", () => {
			const id = btn.dataset.id;
			images.forEach((img) => {
				const show = img.id === `accordion-image-${id}`;
				img.style.transition = "opacity 0.4s";
				img.style.display = "block";
				img.style.opacity = show ? "1" : "0";
				if (!show) setTimeout(() => img.style.opacity === "0" && (img.style.display = "none"), 400);
			});
			buttons.forEach((other) => {
				if (other === btn) return;
				other.classList.remove("is-active");
				other.setAttribute("aria-expanded", "false");
				const c = other.closest(".accordion__item")?.querySelector<HTMLElement>(".accordion__content");
				if (c) slide(c, false);
			});
			const open = !btn.classList.contains("is-active");
			btn.classList.toggle("is-active", open);
			btn.setAttribute("aria-expanded", String(open));
			const content = btn.closest(".accordion__item")?.querySelector<HTMLElement>(".accordion__content");
			if (content) slide(content, open);
		}),
	);
});

// ---- team member bios
const scrollToEl = (el: Element | null, offset: number) => {
	if (!el) return;
	window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: "smooth" });
};
$$(".team").forEach((team) => {
	const wrappers = $$(".team__wrapper", team);
	const reset = () => {
		$$(".team__content.is-active", team).forEach((c) => c.classList.remove("is-active"));
		wrappers.forEach((w) => w.classList.remove("is-active", "is-disabled"));
	};
	wrappers.forEach((w) => {
		const activate = () => {
			const id = w.dataset.id;
			const wasOpen = team.querySelector<HTMLElement>(".team__content.is-active")?.dataset.target === id;
			reset();
			if (!wasOpen) {
				w.classList.add("is-active");
				team.querySelector(`.team__content[data-target="${id}"]`)?.classList.add("is-active");
				wrappers.forEach((o) => o !== w && o.classList.add("is-disabled"));
			}
			scrollToEl(w, 50);
		};
		w.addEventListener("click", activate);
		w.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				activate();
			}
		});
	});
	$$(".team__close", team).forEach((btn) =>
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			const id = btn.closest<HTMLElement>(".team__content")?.dataset.target;
			reset();
			scrollToEl(team.querySelector(`.team__wrapper[data-id="${id}"]`), 150);
		}),
	);
});

// ---- sliders
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

$$(".swiper-text").forEach(
	(el) =>
		new Swiper(el, {
			modules: [Navigation, Pagination],
			autoHeight: true,
			pagination: { el: el.querySelector<HTMLElement>(".swiper-text-pagination"), type: "fraction" },
			navigation: { nextEl: el.querySelector<HTMLElement>(".swiper-text-next"), prevEl: el.querySelector<HTMLElement>(".swiper-text-prev") },
		}),
);

$$(".swiper-home").forEach(
	(el) =>
		new Swiper(el, {
			modules: [Autoplay, EffectFade],
			loop: true,
			speed: 800,
			effect: "fade",
			fadeEffect: { crossFade: true },
			autoplay: reduceMotion ? false : { delay: 8000 },
		}),
);

$$(".swiper-block").forEach((el) => {
	const section = el.closest("section") ?? el.parentElement!;
	new Swiper(el, {
		modules: [Navigation],
		slidesPerView: 1,
		loop: true,
		speed: 800,
		autoHeight: true,
		spaceBetween: 74,
		navigation: { nextEl: section.querySelector<HTMLElement>(".swiper-block-next"), prevEl: section.querySelector<HTMLElement>(".swiper-block-prev") },
		breakpoints: { 768: { slidesPerView: "auto", centeredSlides: true } },
	});
});

$$(".swiper-project").forEach(
	(el) =>
		new Swiper(el, {
			modules: [Navigation],
			slidesPerView: 1,
			navigation: { nextEl: el.querySelector<HTMLElement>(".swiper-project-next"), prevEl: el.querySelector<HTMLElement>(".swiper-project-prev") },
		}),
);

$$(".swiper-logos").forEach(
	(el) =>
		new Swiper(el, {
			modules: [Autoplay],
			spaceBetween: 30,
			centeredSlides: true,
			speed: 4000,
			autoplay: reduceMotion ? false : { delay: 1, disableOnInteraction: false },
			loop: true,
			slidesPerView: 3,
			allowTouchMove: false,
			breakpoints: { 768: { slidesPerView: 6, centeredSlides: true } },
		}),
);

// ---- header hide on scroll down / show on scroll up
{
	const header = document.querySelector(".site-header");
	let last = 0;
	const delta = 15;
	window.addEventListener(
		"scroll",
		() => {
			const st = window.scrollY;
			if (!header) return;
			if (st < 2) header.classList.remove("is-visible");
			if (Math.abs(last - st) <= delta) return;
			if (st > last && last > 0) {
				header.classList.remove("is-visible");
				header.classList.add("is-hidden");
			} else {
				header.classList.remove("is-hidden");
				header.classList.add("is-visible");
			}
			last = st;
		},
		{ passive: true },
	);
}

// ---- back to top
{
	const btn = document.querySelector(".back-to-top");
	window.addEventListener("scroll", () => btn?.classList.toggle("is-visible", window.scrollY > 300), { passive: true });
	btn?.addEventListener("click", (e) => {
		e.preventDefault();
		window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
	});
}

// ---- fade-in blocks
{
	const els = $$(".block-animate");
	if (!("IntersectionObserver" in window) || reduceMotion) {
		els.forEach((el) => el.classList.add("block-fade"));
	} else {
		const io = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					entry.target.classList.add("block-fade");
					io.unobserve(entry.target);
				}
			}
		});
		els.forEach((el) => io.observe(el));
	}
}
