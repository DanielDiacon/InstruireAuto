import React, { useState, useRef, useCallback, useEffect } from "react";
import { useSpring, animated } from "react-spring";
import { useGesture } from "@use-gesture/react";
import { ReactSVG } from "react-svg";
import linkOpen from "../../assets/svg/linkOpen.svg";

const InteractiveImage = ({ className, src, alt, bdrs, events, linkIcon }) => {
   const [isOpen, setIsOpen] = useState(false);
   const [initialRect, setInitialRect] = useState({ width: 0, height: 0 });
   const [accumulatedScale, setAccumulatedScale] = useState(1);
   const [shouldClose, setShouldClose] = useState(false);
   const [isAnimating, setIsAnimating] = useState(false);

   const imgRef = useRef(null);
   const animatedRef = useRef(null);

   const [
      {
         x,
         y,
         scale,
         pointerEvents,
         backgroundOpacity,
         cursor,
         width,
         height,
         borderRadius,
         interactivePointerEvents,
      },
      api,
   ] = useSpring(() => ({
      x: 0,
      y: 0,
      scale: 1,
      pointerEvents: "all",
      backgroundOpacity: 0,
      cursor: "auto",
      width: 0,
      height: 0,
      borderRadius: bdrs || "0px",
      interactivePointerEvents: "all", // Control pointer events for interactive div
      config: { tension: 200, friction: 20 },
   }));

   const handleResize = useCallback(() => {
      if (isOpen) {
         document.body.style.paddingRight = window.matchMedia(
            "(min-width: 768px)"
         ).matches
            ? "16px"
            : "";
      }
   }, [isOpen]);

   useEffect(() => {
      if (isOpen) {
         document.body.style.overflow = "hidden";
         handleResize();
         window.addEventListener("resize", handleResize);
      } else {
         document.body.style.overflow = "";
         document.body.style.paddingRight = "";
         window.removeEventListener("resize", handleResize);
      }

      return () => {
         window.removeEventListener("resize", handleResize);
      };
   }, [isOpen, handleResize]);

   const screenWidth = window.innerWidth;
   const screenHeight = window.innerHeight;
   const smallerDimension = Math.min(screenWidth, screenHeight);

   const openImage = useCallback(() => {
      if (isOpen) return; // Prevent opening if already open
      const rect = imgRef.current.getBoundingClientRect();
      setInitialRect(rect);
      setIsOpen(true);
      setIsAnimating(true);
      api.start({
         scale: 1,
         pointerEvents: "all",
         x: (window.innerWidth - smallerDimension) / 2 - rect.left,
         y: (window.innerHeight - smallerDimension) / 2 - rect.top,
         width: smallerDimension,
         height: smallerDimension,
         backgroundOpacity: 1,
         cursor: "grab",
         borderRadius: "0px",
         interactivePointerEvents: "all",
         config: { tension: 200, friction: 20 },
         onRest: () => {
            setIsAnimating(false);
            api.start({ pointerEvents: "all", cursor: "grab" });
         },
      });
   }, [api, isOpen, smallerDimension]);

   const closeImage = useCallback(() => {
      setIsAnimating(true);
      api.start({
         x: 0,
         y: 0,
         scale: 1,
         width: initialRect.width,
         height: initialRect.height,
         backgroundOpacity: 0,
         pointerEvents: "none",
         borderRadius: bdrs || "0px",
         interactivePointerEvents: "none",
         config: { tension: 200, friction: 20 },
         onRest: () => {
            setIsOpen(false);
            setAccumulatedScale(1);
            setShouldClose(false);
            setIsAnimating(false);
            api.start({
               pointerEvents: "all", // Disable interaction
               interactivePointerEvents: "all", // Disable interactive pointer events
            });
         },
      });
   }, [api, initialRect, bdrs]);

   const handleInitialClick = useCallback(() => {
      if (isOpen && shouldClose) {
         setShouldClose(false);
         api.start({
            x: (window.innerWidth - smallerDimension) / 2 - initialRect.left,
            y: (window.innerHeight - smallerDimension) / 2 - initialRect.top,
            scale: 1,
            width: smallerDimension,
            height: smallerDimension,
            backgroundOpacity: 1,
            pointerEvents: "all",
            borderRadius: "0px",
            cursor: "grab",
            interactivePointerEvents: "all",
            config: { tension: 200, friction: 20 },
            onRest: () => {
               setIsOpen(true);
            },
         });
      }
   }, [api, isOpen, shouldClose, initialRect, smallerDimension]);

   const handleTouchEnd = () => {
      if (isOpen && shouldClose) {
         //setShouldClose(false);
         api.start({
            x: (window.innerWidth - smallerDimension) / 2 - initialRect.left,
            y: (window.innerHeight - smallerDimension) / 2 - initialRect.top,
            scale: 1,
            width: smallerDimension,
            height: smallerDimension,
            backgroundOpacity: 1,
            pointerEvents: "all",
            borderRadius: "0px",
            cursor: "grab",
            interactivePointerEvents: "all",
            config: { tension: 200, friction: 20 },
            onRest: () => {
               setIsOpen(true);
            },
         });
      }
   };

   const handleButtonClick = () => {
      setShouldClose(true);
      closeImage();
   };

   const bind = useGesture(
      {
         onDrag: ({
            down,
            movement: [mx, my],
            memo = { x: x.get(), y: y.get(), shouldClose: false },
            pinching,
         }) => {
            if (!pinching && isOpen) {
               const currentScale = scale.get();
               const rect = animatedRef.current.getBoundingClientRect();
               const imageTop = rect.top + window.scrollY;
               const imageBottom = imageTop + rect.height;
               const visibleTop = window.scrollY + window.innerHeight * 0.4;
               const visibleBottom = window.scrollY + window.innerHeight * 0.6;

               const isAboveTop = imageBottom < visibleTop + rect.height / 2;
               const isBelowBottom = imageTop > visibleBottom - rect.height / 2;

               if (currentScale === 1) {
                  if (isAboveTop || isBelowBottom) {
                     setShouldClose(true);
                  } else {
                     setShouldClose(false);
                  }
               }

               api.start({
                  x: memo.x + mx,
                  y: memo.y + my,
                  cursor: down ? "grabbing" : "grab",
                  pointerEvents: "all",
                  interactivePointerEvents: "all", // Enable interactive pointer events
                  config: { tension: 200, friction: 20 },
                  immediate: true,
               });
            }
            return memo;
         },
         onDragEnd: () => {
            document.activeElement.blur(); // Dezactivează focusul elementului activ
            if (shouldClose) {
               closeImage();
            } else if (scale.get() === 1) {
               setIsOpen(true);
               api.start({
                  x:
                     (window.innerWidth - smallerDimension) / 2 -
                     initialRect.left,
                  y:
                     (window.innerHeight - smallerDimension) / 2 -
                     initialRect.top,
                  pointerEvents: "all",
                  interactivePointerEvents: "all",
                  config: { tension: 200, friction: 20 },
               });
            }
         },
         onPinch: ({
            origin: [ox, oy],
            first,
            offset: [s, a],
            memo,
            event,
         }) => {
            if (isAnimating) {
               event.preventDefault();
               return true;
            }

            if (first) {
               const rect = animatedRef.current.getBoundingClientRect();
               const tx = (ox - (rect.left + rect.width / 2)) / scale.get();
               const ty = (oy - (rect.top + rect.height / 2)) / scale.get();
               memo = [x.get(), y.get(), tx, ty];
            } else {
               const [startX, startY, tx, ty] = memo;
               const newScale = Math.max(
                  1,
                  Math.min(accumulatedScale + (s - 1), 2)
               );
               const x = startX - (newScale / accumulatedScale - 1) * tx;
               const y = startY - (newScale / accumulatedScale - 1) * ty;
               api.start({
                  scale: newScale,
                  rotateZ: a,
                  x,
                  y,
               });
               setAccumulatedScale(newScale);
            }
            return memo;
         },
      },
      {
         drag: { filterTaps: true },
         pinch: { scaleBounds: { min: 1, max: 2 }, rubberband: true },
      }
   );

   useEffect(() => {
      if (imgRef.current) {
         const rect = imgRef.current.getBoundingClientRect();
         api.start({
            width: rect.width,
            height: rect.height,
         });
      }
   }, [api]);

   return (
      <div
         className={`InteractiveImage ${className}`}
         style={{
            borderRadius: bdrs || "0px",
         }}
      >
         <animated.img
            ref={imgRef}
            src={src}
            alt={alt}
            style={{
               cursor: "pointer",
               width: "100%",
               height: "100%",
               transition: "0s",
               userSelect: "none",
               borderRadius: bdrs || "0px",
               opacity: !isOpen ? 1 : 0,
               pointerEvents: !events ? "all" : "none",
            }}
            onClick={openImage}
            onClickCapture={handleInitialClick}
            onTouchEnd={handleTouchEnd}
            draggable="false"
         />
         {linkIcon && (
            <ReactSVG
               className="InteractiveImage__icon"
               src={linkOpen}
               style={{
                  opacity: !isOpen ? 1 : 0,
                  color: "#fff",
                  pointerEvents: "none",
                  transition: "0.3s ease",
               }}
            />
         )}

         {isOpen && (
            <>
               <animated.div
                  style={{
                     position: "fixed",
                     top: 0,
                     left: 0,
                     width: "100%",
                     height: "100%",
                     backgroundColor: "rgba(0, 0, 0, 0.8)",
                     opacity: backgroundOpacity,
                     zIndex: 9998,
                     pointerEvents: `${
                        !isAnimating || !shouldClose ? "all" : "none"
                     }`,
                     touchAction: "none",
                     userSelect: "none",
                     transition: "opacity 0.2s ease",
                  }}
                  onClick={handleButtonClick}
                  draggable="false"
               />
               <animated.div
                  style={{
                     position: "fixed",
                     top: "8px",
                     right: "8px",
                     padding: "5px 20px",
                     borderRadius: "50px",
                     backgroundColor: "rgba(255, 255, 255, 0.8)",
                     lineHeight: 0,
                     opacity: backgroundOpacity,
                     color: "black",
                     zIndex: 10000,
                     transition: "opacity 0.2s ease",
                     cursor: "pointer",
                     pointerEvents: `${shouldClose ? "none" : "all"}`,
                  }}
                  onClick={handleButtonClick}
               >
                  <svg
                     xmlns="http://www.w3.org/2000/svg"
                     width="35"
                     height="35"
                     viewBox="0 0 24 24"
                     style={{
                        touchAction: "none",
                        userSelect: "none",
                        pointerEvents: `${shouldClose ? "none" : "all"}`,
                     }}
                  >
                     <path
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="m7 7l10 10M7 17L17 7"
                     />
                  </svg>
               </animated.div>
               <animated.div
                  {...bind()}
                  ref={animatedRef}
                  draggable="false"
                  style={{
                     position: "fixed",
                     top: initialRect.top,
                     left: initialRect.left,
                     width: width,
                     height: height,
                     transform: x.to(
                        (x) =>
                           `translate3d(${Math.round(x)}px, ${Math.round(
                              y.get()
                           )}px, 0) scale(${scale.get()})`
                     ),
                     zIndex: 9999,
                     cursor: cursor,
                     touchAction: "none",
                     pointerEvents: pointerEvents,
                     borderRadius: borderRadius,
                     overflow: "hidden",
                  }}
               >
                  <img
                     className={isOpen ? "image-animating" : ""}
                     src={src}
                     alt={alt}
                     style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: "block",
                        pointerEvents: "none",
                        touchAction: "none",
                        userSelect: "none",
                     }}
                     draggable="false"
                  />
                  <div
                     style={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        background: "#00000000",
                        zIndex: 11000,
                        top: 0,
                        left: 0,
                        pointerEvents: interactivePointerEvents,
                        userSelect: "none",
                        touchAction: "none",
                     }}
                     draggable="false"
                  />
               </animated.div>
            </>
         )}
      </div>
   );
};

export default InteractiveImage;
