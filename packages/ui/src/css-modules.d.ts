/** CSS Modules shipped with the design system. */
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
/** Side-effect stylesheets. */
declare module "*.css";
