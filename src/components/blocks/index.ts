import Accordion from "./Accordion.astro";
import Awards from "./Awards.astro";
import Carousel from "./Carousel.astro";
import Contact from "./Contact.astro";
import HeroSlider from "./HeroSlider.astro";
import ImageFull from "./ImageFull.astro";
import ImagePair from "./ImagePair.astro";
import ImageTwoThirds from "./ImageTwoThirds.astro";
import Logos from "./Logos.astro";
import Principals from "./Principals.astro";
import ProjectInfo from "./ProjectInfo.astro";
import ProjectList from "./ProjectList.astro";
import ProjectTypes from "./ProjectTypes.astro";
import Quote from "./Quote.astro";
import RelatedNews from "./RelatedNews.astro";
import Story from "./Story.astro";
import Team from "./Team.astro";
import TextColumns from "./TextColumns.astro";
import TextImage from "./TextImage.astro";

export const blockComponents = {
	hero_slider: HeroSlider,
	project_info: ProjectInfo,
	text_columns: TextColumns,
	quote: Quote,
	image_full: ImageFull,
	image_two_thirds: ImageTwoThirds,
	image_pair: ImagePair,
	text_image: TextImage,
	carousel: Carousel,
	story: Story,
	principals: Principals,
	team: Team,
	accordion: Accordion,
	awards: Awards,
	project_types: ProjectTypes,
	project_list: ProjectList,
	logos: Logos,
	related_news: RelatedNews,
	contact: Contact,
};
