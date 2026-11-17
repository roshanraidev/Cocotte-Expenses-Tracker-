'use client';
import {createContext,useContext} from 'react';
import type {Permission} from '@/lib/permissions';
const Context=createContext<{permissions:readonly Permission[];superUser:boolean}|null>(null);
export function PermissionProvider({permissions,children,superUser=false}:{permissions:readonly Permission[];superUser?:boolean;children:React.ReactNode}){return <Context.Provider value={{permissions,superUser}}>{children}</Context.Provider>;}
export function usePermission(permission:Permission){const permissions=useContext(Context);return permissions===null||permissions.permissions.includes(permission);}

export function useSuperUser(){return useContext(Context)?.superUser??true;}
