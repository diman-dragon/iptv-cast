// Какая страница настроек была открыта последней (номер): при возврате на экран остаёмся на ней.
let index = 0;

export const getPageIndex = () => index;
export const setPageIndex = (i) => {
  index = i;
};
