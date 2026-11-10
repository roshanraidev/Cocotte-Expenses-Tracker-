import type {ReactNode} from 'react';
import './recipes.css';
import './library-cards.css';
import './recipe-sheet.css';
export default function RecipeLayout({children}:{children:ReactNode}){
 return <div className="recipe-library">{children}</div>;
}
