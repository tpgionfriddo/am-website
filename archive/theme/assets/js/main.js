(function( $ ) {

	"use strict";
	

    $('.accordion__button').click(function() {

        let id = $(this).data('id');

        $('#accordion-image-' + id).fadeIn().siblings().fadeOut();
        
        $(this).closest('.accordion__item').siblings().find('.accordion__content').slideUp('fast');
        $(this).closest('.accordion__item').siblings().find('.accordion__button').removeClass('is-active');
        $(this).toggleClass('is-active').parent().next().slideToggle('fast');

        

    });

    $('.modal__button').click(function() {
        $('.modal').addClass('close');
    });


    $('.menu-toggle').click(function() {

        $(this).toggleClass('is-active');

        $('body').toggleClass('is-menu-open');

        $('.overlay-menu').toggleClass('is-open');

    });

    $('.team__wrapper').click(function() {

        let id = $(this).data('id');
        let content_id = $('.team__content.is-active').data('target');

      
        $('.team__content.is-active').removeClass('is-active');
        $('.team__wrapper').removeClass('is-active is-disabled');

        $('[data-id=' + id + ']').addClass('is-active');
        $('[data-target=' + id + ']').addClass('is-active');

        $('.team__wrapper:not([data-id=' + id + '])').addClass('is-disabled');

        if( id == content_id ) {
            $('.team__content.is-active').removeClass('is-active');
            $('.team__wrapper').removeClass('is-active is-disabled');
        }

        

        // $('.team__wrapper').removeClass('is-disabled is-active');
        // $('.team__content').removeClass('is-active');
        
        // if( $(this).hasClass('is-active') ) {
        //     $('.team__wrapper').removeClass('is-disabled is-active');            
        //     $('.team__content').removeClass('is-active');

        //     return;
        // }
    

        // let id = $(this).data('id');

        // $('.team__wrapper').addClass('is-disabled');
    
        // $(this).removeClass('is-disabled');

        // $('.team__content').removeClass('is-active');

        // $('[data-id=' + id + ']').addClass('is-active');
    
        // $('[data-target=' + id + ']').addClass('is-active');


        $('html, body').animate({
            scrollTop: $('[data-id=' + id + ']').offset().top - 50
        }, 100);        
    });

    $('.team__close').click(function() {

        let id = $(this).closest('.team__content').data('target');

        $('.team__wrapper').removeClass('is-disabled is-active');
        $('.team__content').removeClass('is-active');

        $('html, body').animate({
            scrollTop: $('[data-id=' + id + ']').offset().top - 150
        }, 100);     
    })

    
    // Text Slider
    const swiperText = new Swiper(".swiper-text", {
        autoHeight: true,
        pagination: {
          el: ".swiper-text-pagination",
          type: "fraction",
        },
        navigation: {
          nextEl: ".swiper-text-next",
          prevEl: ".swiper-text-prev",
        },
      });


    // Home Slider
    const swiperHome = new Swiper(".swiper-home", {
        loop: true,
        speed: 800,
        effect: "fade",
        fadeEffect: {
            crossFade: true
        },
        autoplay: {
            delay: 8000,
        }
    });

    // Project Carousel
    const swiperBlock = new Swiper(".swiper-block", {
        slidesPerView: 1,
        loop: true,
        speed: 800,
        autoHeight: true,
        spaceBetween: 74,
        navigation: {
            nextEl: ".swiper-block-next",
            prevEl: ".swiper-block-prev",
        },
        breakpoints: {
            768: {
                slidesPerView: "auto",
                centeredSlides: true,
            },
        },

    });


     // Project slider
    const swiperProject = new Swiper(".swiper-project", {
        slidesPerView: 1,
        navigation: {
            nextEl: ".swiper-project-next",
            prevEl: ".swiper-project-prev",
        },
    });

    const swiperLogos = new Swiper(".swiper-logos", {
        spaceBetween: 30,
        centeredSlides: true,
        speed: 4000,
        autoplay: {
            delay: 1,
            disableOnInteraction: false
        },
        loop: true,
        slidesPerView: 3,
        allowTouchMove: false,
        breakpoints: {
            768: {
                slidesPerView: 6,
                centeredSlides: true,
            },
        },
    });



    let lastScrollTop = 0, delta = 15;

    $(window).scroll(function(event) {

        let st = $(this).scrollTop();

        if( st < 2  ) {
            $(".site-header").removeClass('is-visible');
        } 
        
        if(Math.abs(lastScrollTop - st) <= delta) return;
     
            
        if ((st > lastScrollTop) && (lastScrollTop > 0)) {
            // downscroll code
            $(".site-header").removeClass('is-visible').addClass('is-hidden');
        
        } else {
           
         $(".site-header").removeClass('is-hidden').addClass('is-visible');
            
        }

        lastScrollTop = st;

    });

    const backToTop = $('.back-to-top');

    $(window).scroll(function() {

        if ($(window).scrollTop() > 300) {

            backToTop.addClass('is-visible');

        } else {

            backToTop.removeClass('is-visible');

        }

    });

    backToTop.on('click', function(e) {

         e.preventDefault();

        $('html, body').animate({scrollTop:0}, '300');
    
    });
        

    const observer = new IntersectionObserver( entries => {
        entries.forEach( entry => {
            // entry.target.classList.toggle('block-fade', entry.isIntersecting);
            if( entry.isIntersecting ) {
                entry.target.classList.add('block-fade');
            }
        });
    });

    const fadeElements = document.querySelectorAll('.block-animate');
    fadeElements.forEach( el => observer.observe(el) );
    

})(jQuery);


// fix iso floating bar issue 

const vh = window.innerHeight * 0.01;
document.documentElement.style.setProperty('--vh', `${vh}px`);

window.addEventListener('resize', () => {
  // We execute the same script as before
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
});

