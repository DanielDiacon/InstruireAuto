import { Link as ScrollLink } from 'react-scroll'; // Importăm Link din react-scroll
function MenuItem(props) {
   return (
      <ScrollLink
         to={props.link}
         smooth={true}
         duration={500}
         className="menu__link"
      >
         {props.children}
         <span className="menu__nav-text">{props.navText}</span>
      </ScrollLink>
   );
}
export default MenuItem;
