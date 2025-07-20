import { useNavigate } from 'react-router-dom';
import { scroller } from 'react-scroll';
function SmoothLink(props) {
   const navigate = useNavigate();
   const goToPageAndScroll = async (selector) => {
      await navigate('/');
      scroller.scrollTo(selector, {
         duration: 500,
         smooth: true,
         spy: true,
      });
   };
   return (
      <button
         className="menu__link"
         onClick={() => goToPageAndScroll(props.to)}
      >
         {props.children}
         <span className="menu__nav-text">{props.text}</span>
      </button>
   );
}
export default SmoothLink;
