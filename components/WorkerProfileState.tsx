"use client";
import {createContext,useContext,useState,type ReactNode} from "react";
const ProfileState=createContext<{name:string;setName:(name:string)=>void}|null>(null);
export function WorkerProfileState({initialName,children}:{initialName:string;children:ReactNode}){const [name,setName]=useState(initialName);return <ProfileState.Provider value={{name,setName}}>{children}</ProfileState.Provider>}
export function useWorkerProfileName(){return useContext(ProfileState)}
export function WorkerCardHeading({specialty}:{specialty:string}){const state=useWorkerProfileName();return <div><h1>{state?.name}</h1><p>Сотрудник · {specialty}</p></div>}
