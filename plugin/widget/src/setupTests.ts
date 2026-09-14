import '@testing-library/jest-dom';

// Mock scrollTo for jsdom
HTMLElement.prototype.scrollTo = () => {};
