export const toggleSettings = () => {
   document.body.classList.toggle('settings-open');
   if (document.body.classList.contains('menu-open')) {
      document.body.classList.remove('menu-open');
      document.body.classList.add('settings-open');
   }
};

export const toggleMenu = () => {
   document.body.classList.toggle('menu-open');
   if (document.body.classList.contains('settings-open')) {
      document.body.classList.remove('settings-open');
      document.body.classList.add('menu-open');
   }
};
export const closeAll = () => {
   if (document.body.classList.contains('settings-open')) {
      document.body.classList.remove('settings-open');
   }
   if (document.body.classList.contains('menu-open')) {
      document.body.classList.remove('menu-open');
   }
};
